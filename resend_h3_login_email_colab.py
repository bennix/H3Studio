assert globals().get('PUBLIC_URL') and globals().get('COMFY_PASSWORD'), '请先运行部署单元格'
'Include in the Colab startup cell; requires a Colab secret, never a printed token.'
import hashlib
import smtplib
import ssl
from email.message import EmailMessage
COMFY_NOTIFICATION_EMAIL = globals().get('H3_NOTIFICATION_EMAIL') or input('接收登录信息的 Gmail 邮箱：').strip()
_COMFY_NOTIFIED_LOGINS = globals().get('_COMFY_NOTIFIED_LOGINS', set())

def get_h3_gmail_password():
    cached = globals().get('H3_GMAIL_APP_PASSWORD', '')
    if cached:
        return cached
    try:
        from google.colab import userdata
        value = userdata.get('COMFY_GMAIL_APP_PASSWORD')
    except Exception as error:
        reason = type(error).__name__
        if reason == 'NotebookAccessError':
            print('已有邮件密钥尚未授权本笔记本，可在左侧 Secret 开启访问权限，或在下方临时填写。')
        elif reason == 'SecretNotFoundError':
            print('当前 Colab 未配置 Gmail 应用专用密码，请通过下方链接生成后填写。')
        else:
            print('暂时无法读取 Colab 邮件密钥，可在下方临时填写 Gmail 应用专用密码。')
        from IPython.display import display, HTML
        display(HTML('<section><h3>生成 Gmail 应用专用密码</h3><ol><li>登录上方填写的 Gmail 账号，打开 <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener">Google 两步验证</a>，按页面提示完成开启。</li><li>打开 <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">应用专用密码</a>。Google 可能要求重新登录。</li><li>在“应用名称”填写 H3 Studio，点击“创建”。</li><li>复制 Google 显示的 16 位应用专用密码，粘贴到下方隐藏输入框并回车。密码中的空格会自动去除。</li></ol><p>这里填写 Google 生成的应用专用密码。临时输入仅用于当前 Colab 运行时，重建运行时后需再次填写。也可将其保存为 Colab Secret COMFY_GMAIL_APP_PASSWORD，并开启本笔记本访问权限。</p></section>'))
        import getpass
        value = getpass.getpass('Gmail 应用专用密码（隐藏输入，仅保存在当前运行时内存）：')
    value = value.replace(' ', '').strip()
    if not value:
        raise RuntimeError('未填写 Gmail 应用专用密码。请配置 Secret 或在隐藏输入框填写后重试。')
    globals()['H3_GMAIL_APP_PASSWORD'] = value
    return value

def send_comfy_login_email(url, username, password):
    key = hashlib.sha256((url + '\n' + username + '\n' + password).encode()).hexdigest()
    if key in _COMFY_NOTIFIED_LOGINS:
        return COMFY_NOTIFICATION_EMAIL
    app_password = get_h3_gmail_password()
    message = EmailMessage()
    message['From'] = COMFY_NOTIFICATION_EMAIL
    message['To'] = COMFY_NOTIFICATION_EMAIL
    message['Subject'] = 'ComfyUI 启动登录信息'
    message.set_content(f'ComfyUI 已启动。\n\n入口：{url}\n用户名：{username}\n密码：{password}\n\n此链接随 Colab 运行时或隧道结束而失效。请勿转发本邮件。')
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=ssl.create_default_context(), timeout=30) as smtp:
            smtp.login(COMFY_NOTIFICATION_EMAIL, app_password)
            smtp.send_message(message)
    except (smtplib.SMTPException, OSError):
        raise RuntimeError('邮件发送失败：请检查 Gmail 应用专用密码和网络后重试；密码未写入输出。') from None
    _COMFY_NOTIFIED_LOGINS.add(key)
    return COMFY_NOTIFICATION_EMAIL
print('登录邮件已发送至：', send_comfy_login_email(PUBLIC_URL, 'comfy', COMFY_PASSWORD))
