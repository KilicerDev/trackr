//
//  SnapshotStore.swift
//  trackr-mobile-ios
//
//  The offline cache behind the no-flash launch: every API response worth
//  showing again is persisted as JSON, keyed by endpoint, in a per-host
//  directory under Application Support. Screens render from the snapshot
//  instantly; refreshes overwrite it. Deliberately not a database — the API
//  returns full collections, so "the last response" IS the natural cache
//  unit (SwiftData would fight that shape for no gain).
//

import CryptoKit
import Foundation

struct SnapshotStore {
    private let directory: URL

    init(host: URL) {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        // Hash the host so switching servers can never mix two instances' data.
        let digest = SHA256.hash(data: Data(host.absoluteString.utf8))
        let folder = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
        directory = base.appending(path: "Snapshots/\(folder)", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func url(for key: String) -> URL {
        directory.appending(path: "\(key).json")
    }

    func load<T: Decodable>(_ key: String, as type: T.Type) -> T? {
        guard let data = try? Data(contentsOf: url(for: key)) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    func save<T: Encodable>(_ key: String, _ value: T) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url(for: key), options: .atomic)
    }

    func clear() {
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
}
