// Package health serves the HTTP liveness/readiness probes the platform uses
// to gate rollouts and restart wedged replicas. Probes are HTTP-only on skali,
// so even a service with no public route (worker, scheduler) needs a tiny
// listener; this is that listener, shared so no service reimplements it.
//
// Two endpoints, mirroring web/src/routes/healthz:
//
//	GET /healthz        liveness  — the process serves HTTP. Never touches the
//	                    database: a DB outage must fail readiness, not liveness
//	                    (restart loops help nothing there).
//	GET /healthz/ready  readiness — the service can do its work right now. 503
//	                    while starting (no database yet), while the readiness
//	                    check fails, and while draining for shutdown.
package health

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"sync/atomic"
	"time"
)

const (
	// Bound on a single readiness check; the platform probe timeout is longer.
	readyTimeout = 3 * time.Second
	// Headers must arrive within this window; probes are tiny requests.
	readHeaderTimeout = 5 * time.Second
	// How long Close waits for in-flight probe responses.
	closeTimeout = 2 * time.Second
	// DefaultPort is used when neither HEALTH_PORT nor PORT is set.
	DefaultPort = "8081"
)

// ReadyFunc reports whether the service can currently do its work. Return an
// error to fail readiness; the message is written to the response body.
type ReadyFunc func(ctx context.Context) error

// AddrFromEnv resolves the listen address: HEALTH_PORT if set, else PORT (which
// `skali dev` injects for the auto-allocated host port), else DefaultPort. The
// bind is 0.0.0.0 because the platform (and the dev gateway) probe from the
// container network; a loopback bind is unreachable there.
func AddrFromEnv() string {
	for _, key := range []string{"HEALTH_PORT", "PORT"} {
		if v := os.Getenv(key); v != "" {
			return ":" + v
		}
	}
	return ":" + DefaultPort
}

// Server is the probe listener. Build one with Listen, then Start it.
type Server struct {
	ln       net.Listener
	srv      *http.Server
	log      *slog.Logger
	ready    atomic.Pointer[ReadyFunc]
	draining atomic.Bool
}

// Listen binds addr immediately so a port conflict fails at boot instead of
// surfacing as a probe timeout later. ready may be nil (readiness reports
// "starting" until SetReady is called).
func Listen(addr string, ready ReadyFunc, log *slog.Logger) (*Server, error) {
	if log == nil {
		log = slog.Default()
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}
	s := &Server{ln: ln, log: log.With("component", "health")}
	if ready != nil {
		s.ready.Store(&ready)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleLive)
	mux.HandleFunc("GET /healthz/ready", s.handleReady)
	s.srv = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: readHeaderTimeout,
	}
	return s, nil
}

// Addr is the bound address (useful when the port was auto-assigned).
func (s *Server) Addr() net.Addr { return s.ln.Addr() }

// Start serves probes in the background. Serve errors other than a clean Close
// are logged; the service keeps running because probes are observability, not
// the workload itself.
func (s *Server) Start() {
	s.log.Info("health probes listening", "addr", s.ln.Addr().String())
	go func() {
		if err := s.srv.Serve(s.ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			s.log.Error("health server stopped", "error", err)
		}
	}()
}

// SetReady installs (or replaces) the readiness check. Call it once the
// dependencies the check needs (the database pool) exist.
func (s *Server) SetReady(ready ReadyFunc) {
	s.ready.Store(&ready)
}

// Drain flips readiness to 503 for the rest of the process lifetime. Call it
// when shutdown begins so the platform stops counting this replica as ready
// while in-flight work finishes. Liveness keeps passing.
func (s *Server) Drain() {
	s.draining.Store(true)
}

// Close stops the listener, waiting briefly for in-flight probe responses.
func (s *Server) Close() {
	ctx, cancel := context.WithTimeout(context.Background(), closeTimeout)
	defer cancel()
	if err := s.srv.Shutdown(ctx); err != nil {
		_ = s.srv.Close()
	}
}

func (s *Server) handleLive(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("ok"))
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")

	if s.draining.Load() {
		http.Error(w, "draining", http.StatusServiceUnavailable)
		return
	}
	ready := s.ready.Load()
	if ready == nil {
		http.Error(w, "starting", http.StatusServiceUnavailable)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), readyTimeout)
	defer cancel()
	if err := (*ready)(ctx); err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	_, _ = w.Write([]byte("ok"))
}
