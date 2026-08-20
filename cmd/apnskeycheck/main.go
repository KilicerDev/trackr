package main

// Quick harness: generate a P-256 PKCS8 key, feed it to the loader in all
// three forms, expect all to parse.
import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"os"

	"github.com/KilicerDev/trackr/services/worker/internal/push"
)

func main() {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	der, _ := x509.MarshalPKCS8PrivateKey(key)
	pemText := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	b64 := base64.StdEncoding.EncodeToString(der)
	path := "/tmp/apnstest.p8"
	os.WriteFile(path, []byte(pemText), 0600)

	for name, val := range map[string]string{"pem": pemText, "path": path, "base64": b64} {
		_, err := push.New(push.Config{Key: val, KeyID: "K", TeamID: "T", BundleID: "B"})
		fmt.Println(name, "→", err)
	}
}
