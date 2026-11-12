import Foundation

@main
struct RemoteImageMetadataTest {
    static func main() throws {
        let actual = """
        {"filename":"H3Studio_00001_.png","subfolder":"","type":"output","metadata":{"kind":"image","width":2048,"height":2048}}
        """
        let decoded = try JSONSerialization.jsonObject(with: Data(actual.utf8))
        let result = try normalizedRemoteImage(decoded)
        precondition(result == ["filename":"H3Studio_00001_.png", "subfolder":"", "type":"output"])
        let legacy = try normalizedRemoteImage(["filename":"legacy.png"])
        precondition(legacy["type"] == "output")
        do {
            _ = try normalizedRemoteImage(["metadata": ["width": 2048]])
            fatalError("Missing filenames must be rejected")
        } catch RemoteImageError.missingFilename {}
        print("真实 ComfyUI 嵌套元数据、旧版元数据和缺失文件名验证通过。")
    }
}
