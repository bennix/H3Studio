import Foundation

enum RemoteImageError: LocalizedError {
    case missingFilename
    var errorDescription: String? { "远端图片信息缺少文件名" }
}

// New ComfyUI versions attach nested metadata with dimensions to each image.
// Only these three fields belong in /view queries and clipboard/save requests.
func normalizedRemoteImage(_ object: Any?) throws -> [String: String] {
    guard let image = object as? [String: Any],
          let filename = image["filename"] as? String,
          !filename.isEmpty else { throw RemoteImageError.missingFilename }
    return [
        "filename": filename,
        "subfolder": image["subfolder"] as? String ?? "",
        "type": image["type"] as? String ?? "output",
    ]
}
