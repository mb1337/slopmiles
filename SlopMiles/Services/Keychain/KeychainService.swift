import Foundation
import Security

struct KeychainService: Sendable {
    private let serviceName = "com.slopmiles.app"

    func save(key: String, value: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }

        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]

        let status = SecItemAdd(addQuery as CFDictionary, nil)
        return status == errSecSuccess
    }

    func read(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func delete(key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
        ]

        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    func hasKey(_ key: String) -> Bool {
        read(key: key) != nil
    }

    var anthropicAPIKey: String? {
        read(key: "anthropic_api_key")
    }

    var openAIAPIKey: String? {
        read(key: "openai_api_key")
    }

    @discardableResult
    func setAnthropicAPIKey(_ value: String) -> Bool {
        save(key: "anthropic_api_key", value: value)
    }

    @discardableResult
    func setOpenAIAPIKey(_ value: String) -> Bool {
        save(key: "openai_api_key", value: value)
    }
}
