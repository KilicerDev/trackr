//
//  KeychainStore.swift
//  trackr-mobile-ios
//
//  Bearer-token storage. The Tauri app kept its token in a plaintext store
//  and that was flagged as a hardening gap — here it lives in the Keychain
//  from day one.
//

import Foundation
import OSLog
import Security

nonisolated enum KeychainStore {
    private static let service = "dev.kilicer.trackr.session"
    private static let account = "bearer-token"
    private static let log = Logger(subsystem: "dev.kilicer.trackr", category: "keychain")

    static var token: String? {
        get {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecReturnData as String: true,
                kSecMatchLimit as String: kSecMatchLimitOne,
            ]
            var result: AnyObject?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            guard status == errSecSuccess, let data = result as? Data else {
                // Not-found is the normal signed-out case; anything else
                // (e.g. -34018 on a build without an application-identifier
                // entitlement) means the session silently can't persist.
                if status != errSecItemNotFound {
                    log.error("token read failed: \(status)")
                }
                return nil
            }
            return String(data: data, encoding: .utf8)
        }
        set {
            let base: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
            ]
            let deleted = SecItemDelete(base as CFDictionary)
            if deleted != errSecSuccess, deleted != errSecItemNotFound {
                log.error("token delete failed: \(deleted)")
            }
            guard let newValue, let data = newValue.data(using: .utf8) else { return }
            var add = base
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let added = SecItemAdd(add as CFDictionary, nil)
            if added != errSecSuccess {
                log.error("token write failed: \(added)")
            }
        }
    }
}
