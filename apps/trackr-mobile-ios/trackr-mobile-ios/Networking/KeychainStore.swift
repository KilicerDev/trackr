//
//  KeychainStore.swift
//  trackr-mobile-ios
//
//  Bearer-token storage. The Tauri app kept its token in a plaintext store
//  and that was flagged as a hardening gap — here it lives in the Keychain
//  from day one.
//

import Foundation
import Security

enum KeychainStore {
    private static let service = "dev.kilicer.trackr.session"
    private static let account = "bearer-token"

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
            guard
                SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
                let data = result as? Data
            else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            let base: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
            ]
            SecItemDelete(base as CFDictionary)
            guard let newValue, let data = newValue.data(using: .utf8) else { return }
            var add = base
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(add as CFDictionary, nil)
        }
    }
}
