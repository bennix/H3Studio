import AppKit
import WebKit
import UniformTypeIdentifiers

struct ClientError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandlerWithReply, WKUIDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var remoteURL: URL?
    var authorization: String?
    let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 45
        configuration.timeoutIntervalForResource = 120
        configuration.urlCredentialStorage = nil
        return URLSession(configuration: configuration)
    }()

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let applicationMenu = NSMenu()
        applicationMenu.addItem(withTitle: "关于 H3 Studio", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        applicationMenu.addItem(NSMenuItem.separator())
        applicationMenu.addItem(withTitle: "退出 H3 Studio", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let applicationItem = NSMenuItem()
        applicationItem.submenu = applicationMenu
        menu.addItem(applicationItem)
        let edit = NSMenu(title: "编辑")
        for (title, selector, key) in [("撤销", "undo:", "z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        let editItem = NSMenuItem(title: "编辑", action: nil, keyEquivalent: "")
        editItem.submenu = edit
        menu.addItem(editItem)
        NSApplication.shared.mainMenu = menu

        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "h3")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 880), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "H3 Studio"
        window.minSize = NSSize(width: 1040, height: 760)
        window.backgroundColor = NSColor(calibratedRed: 0.075, green: 0.078, blue: 0.08, alpha: 1)
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
        if let resource = Bundle.main.resourceURL {
            webView.loadFileURL(resource.appendingPathComponent("index.html"), allowingReadAccessTo: resource)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let input = message.body as? [String: Any] else {
            replyHandler(nil, "请求格式无效")
            return
        }
        Task {
            do { replyHandler(try await handle(input), nil) }
            catch { replyHandler(nil, error.localizedDescription) }
        }
    }

    func request(_ path: String, method: String = "GET", query: [String: String] = [:], body: Data? = nil, contentType: String? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let base = remoteURL, let authorization else { throw ClientError(message: "请先连接 Colab") }
        var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue(authorization, forHTTPHeaderField: "Authorization")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        request.httpBody = body
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ClientError(message: "远端未返回 HTTP 响应") }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw ClientError(message: "用户名或密码不正确，请使用本次启动邮件中的密码") }
            if http.statusCode == 403 { throw ClientError(message: "远端拒绝访问，请运行 Colab 第 16 启动单元格后重试") }
            let detail = String(data: data, encoding: .utf8) ?? ""
            throw ClientError(message: "远端 HTTP \(http.statusCode)\(detail.isEmpty ? "" : " · " + String(detail.prefix(900)))")
        }
        return (data, http)
    }

    func json(_ path: String, method: String = "GET", value: Any? = nil) async throws -> Any {
        let body = try value.map { try JSONSerialization.data(withJSONObject: $0) }
        let (data, _) = try await request(path, method: method, body: body, contentType: body == nil ? nil : "application/json")
        if data.isEmpty { return ["ok": true] }
        return try JSONSerialization.jsonObject(with: data)
    }

    func handle(_ input: [String: Any]) async throws -> Any {
        let action = input["action"] as? String ?? ""
        switch action {
        case "connect":
            guard let text = input["url"] as? String, let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), let host = url.host else {
                throw ClientError(message: "请输入有效的远端地址")
            }
            guard url.scheme == "https" || (url.scheme == "http" && ["127.0.0.1", "localhost"].contains(host)) else {
                throw ClientError(message: "远端地址需要使用 HTTPS")
            }
            guard url.user == nil && url.password == nil else { throw ClientError(message: "请在独立的用户名和密码栏输入登录信息") }
            let user = input["username"] as? String ?? "comfy"
            let password = input["password"] as? String ?? ""
            guard !password.isEmpty else { throw ClientError(message: "请输入登录邮件中的密码") }
            remoteURL = URL(string: "\(url.scheme!)://\(host)\(url.port.map { ":\($0)" } ?? "")")
            authorization = "Basic " + Data("\(user):\(password)".utf8).base64EncodedString()
            do {
                let stats = try await json("system_stats")
                let nodeInfo = try await json("object_info/H3ReferenceEdit") as? [String: Any] ?? [:]
                guard nodeInfo["H3ReferenceEdit"] != nil else { throw ClientError(message: "远端缺少参考图编辑节点，请运行 Colab 最新的第 14 启动单元格") }
                let trash = try? await json("h3-studio/results/trash")
                return ["stats": stats, "host": host, "supportsTrash": trash != nil]
            } catch {
                remoteURL = nil
                authorization = nil
                throw error
            }
        case "disconnect":
            remoteURL = nil
            authorization = nil
            return ["ok": true]
        case "upload":
            guard let encoded = input["base64"] as? String, let bytes = Data(base64Encoded: encoded), bytes.count <= 30 * 1024 * 1024 else {
                throw ClientError(message: "图片读取失败或超过 30 MB")
            }
            let mime = input["mime"] as? String ?? "image/png"
            let extensions = ["image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"]
            guard let ext = extensions[mime] else { throw ClientError(message: "请使用 PNG、JPEG 或 WebP 图片") }
            let filename = "H3Studio-\(UUID().uuidString).\(ext)"
            let boundary = "H3-\(UUID().uuidString)"
            var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"image\"; filename=\"\(filename)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8)
            body.append(bytes)
            body.append(Data("\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"type\"\r\n\r\ninput\r\n--\(boundary)--\r\n".utf8))
            let (data, _) = try await request("upload/image", method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
            return try JSONSerialization.jsonObject(with: data)
        case "generate":
            guard let prompt = input["prompt"] as? [String: Any], let workflow = input["workflow"] as? [String: Any] else { throw ClientError(message: "工作流数据缺失") }
            return try await json("prompt", method: "POST", value: ["prompt": prompt, "extra_data": ["extra_pnginfo": ["workflow": workflow]], "client_id": "h3-studio-" + UUID().uuidString])
        case "history":
            guard let id = input["id"] as? String, UUID(uuidString: id) != nil else { throw ClientError(message: "任务编号无效") }
            return try await json("history/" + id)
        case "view", "save", "copy":
            let query = try normalizedRemoteImage(input["image"])
            let filename = query["filename"]!
            let (data, response) = try await request("view", query: query)
            if action == "view" { return ["base64": data.base64EncodedString(), "mime": response.mimeType ?? "image/png"] }
            if action == "copy" {
                guard let image = NSImage(data: data) else { throw ClientError(message: "图片无法拷贝") }
                let pasteboard = NSPasteboard.general
                pasteboard.clearContents()
                guard pasteboard.writeObjects([image]) else { throw ClientError(message: "系统剪贴板写入失败") }
                return ["copied": true]
            }
            let panel = NSSavePanel()
            panel.nameFieldStringValue = filename
            panel.allowedContentTypes = [UTType(filenameExtension: (filename as NSString).pathExtension) ?? .png]
            if panel.runModal() == .OK, let target = panel.url {
                try data.write(to: target, options: .atomic)
                return ["saved": true]
            }
            return ["saved": false]
        case "trash":
            let image = try normalizedRemoteImage(input["image"])
            return try await json("h3-studio/results/trash", method: "POST", value: ["image": image])
        case "restore":
            guard let token = input["token"] as? String, UUID(uuidString: token) != nil else { throw ClientError(message: "回收站编号无效") }
            return try await json("h3-studio/results/restore", method: "POST", value: ["token": token])
        case "recent":
            if let value = try? await json("h3-studio/results"), let listing = value as? [String: Any], let items = listing["items"] as? [[String: Any]] {
                return items.compactMap { item -> [String: Any]? in
                    guard let metadata = try? normalizedRemoteImage(item["image"]) else { return nil }
                    return ["image": metadata]
                }
            }
            let (data, _) = try await request("history", query: ["max_items": "12"])
            let history = try JSONSerialization.jsonObject(with: data) as? [String: [String: Any]] ?? [:]
            let sorted = history.sorted {
                let left = ($0.value["prompt"] as? [Any])?.first as? NSNumber
                let right = ($1.value["prompt"] as? [Any])?.first as? NSNumber
                return (left?.doubleValue ?? 0) > (right?.doubleValue ?? 0)
            }
            var hidden = Set<String>()
            if let value = try? await json("h3-studio/results/trash"), let trash = value as? [String: Any] {
                for item in trash["items"] as? [[String: Any]] ?? [] {
                    if let metadata = try? normalizedRemoteImage(item["image"]) {
                        hidden.insert(metadata["subfolder"]! + "/" + metadata["filename"]!)
                    }
                }
            }
            var results: [[String: Any]] = []
            var seen = Set<String>()
            for (id, job) in sorted {
                let outputs = job["outputs"] as? [String: [String: Any]] ?? [:]
                for output in outputs.values {
                    for image in output["images"] as? [[String: Any]] ?? [] {
                        guard let metadata = try? normalizedRemoteImage(image), metadata["type"] == "output" else { continue }
                        let filename = metadata["filename"]!
                        let ext = (filename as NSString).pathExtension.lowercased()
                        guard ["png", "jpg", "jpeg", "webp"].contains(ext) else { continue }
                        let key = metadata["subfolder"]! + "/" + filename
                        if !hidden.contains(key) && seen.insert(key).inserted {
                            results.append(["image": metadata, "prompt_id": id])
                        }
                    }
                }
            }
            return results
        case "saveBalance":
            guard let balance = input["balance"] as? Double, balance.isFinite, balance >= 0,
                  let rate = input["rate"] as? Double, rate.isFinite, rate >= 0 else {
                throw ClientError(message: "请输入大于等于零的余额和每小时消耗")
            }
            let data: [String: Any] = ["balance": balance, "rate_per_hour": rate, "observed_at_ms": Date().timeIntervalSince1970 * 1000, "source": "用户依据 Colab 资源面板校准"]
            _ = try await json("userdata/colab_compute_units.json", method: "POST", value: data)
            return try await json("userdata/colab_compute_units.json")
        case "balance":
            do {
                let (data, _) = try await request("userdata/colab_compute_units.json", query: ["t": String(Date().timeIntervalSince1970)])
                return try JSONSerialization.jsonObject(with: data)
            } catch { return ["available": false] }
        case "template":
            guard let url = Bundle.main.url(forResource: "workflow", withExtension: "json") else { throw ClientError(message: "应用工作流资源缺失") }
            return try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        case "copyDeployScript":
            guard let url = Bundle.main.url(forResource: "colab_deploy", withExtension: "py") else { throw ClientError(message: "应用部署脚本缺失") }
            let script = try String(contentsOf: url, encoding: .utf8)
            NSPasteboard.general.clearContents()
            guard NSPasteboard.general.setString(script, forType: .string) else { throw ClientError(message: "无法拷贝部署脚本") }
            return ["ok": true]
        case "newNotebook":
            NSWorkspace.shared.open(URL(string: "https://colab.research.google.com/notebook#create=true")!)
            return ["ok": true]
        case "notebook", "startRemote":
            NSWorkspace.shared.open(URL(string: "https://colab.research.google.com/notebook#create=true")!)
            return ["ok": true]
        case "mail":
            NSWorkspace.shared.open(URL(string: "https://mail.google.com/mail/u/0/#search/ComfyUI")!)
            return ["ok": true]
        default:
            throw ClientError(message: "不支持的操作")
        }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg, .webP]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, !url.isFileURL {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        } else { decisionHandler(.allow) }
    }
}

@main
struct H3Studio {
    @MainActor
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        application.run()
    }
}
