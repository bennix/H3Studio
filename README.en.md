# H3 Studio

[中文说明](README.md) · [Open the deployment notebook in Colab](https://colab.research.google.com/github/bennix/H3Studio/blob/main/H3-Studio-Colab.ipynb)

A macOS client for image generation and reference editing with MiniMax H3 Image and ComfyUI running on Google Colab. Model downloads, inference, and generated files are handled on the Colab runtime through a password-protected public endpoint.

![H3 Studio 1.5.3 GUI](docs/images/h3-studio-gui.png)

## Requirements

- macOS 13 or later with Xcode Command Line Tools installed.
- A Google Colab account with access to a GPU. L4 with about 24 GB VRAM and High RAM is recommended.
- Colab disk space for about 29.4 GB of model weights, plus dependencies, caches, and outputs.
- A Gmail account that sends the connection details to itself.

Generation at 2048 × 2048, 6 steps, and CFG 1 has been tested on NVIDIA L4. GPU availability, session limits, and compute-unit rates are controlled by Colab.

## 1. Build and launch the app

Install Apple's developer tools if needed, and complete the installation in the system dialog.

```sh
xcode-select --install
```

Clone and build the app. The build uses your Mac's CPU architecture and applies an ad hoc local signature.

```sh
git clone https://github.com/bennix/H3Studio.git
cd H3Studio
./H3Studio/build.sh "$HOME/Applications/H3 Studio.app"
open "$HOME/Applications/H3 Studio.app"
```

For later launches, open `~/Applications/H3 Studio.app` directly.

## 2. Deploy to a blank Colab notebook

1. In the app, click **启动远端** (Start remote). This copies the complete deployment script to your system clipboard and opens a new Colab notebook.
2. In Colab, choose **Runtime → Change runtime type**, select **L4 GPU**, enable **High RAM**, save, and connect.
3. Add a code cell, paste the complete script, and run it.
4. Enter your Gmail address and provide its app password when prompted. The first run installs ComfyUI, downloads the three model files, installs reference-editing and result-management nodes, and starts a password-protected proxy and temporary Cloudflare tunnel.
5. Wait for the remote-ready message and the email titled **ComfyUI 启动登录信息**. It contains your public URL, username, and login password.

You can also open the repository's deployment notebook, select a GPU, and run its code cell. Both options use the same deployment code.

[Open the Colab deployment notebook](https://colab.research.google.com/github/bennix/H3Studio/blob/main/H3-Studio-Colab.ipynb)

The **拷贝部署脚本** (Copy deployment script) button copies the script for use in an existing notebook. Its source is [colab_deploy.py](H3Studio/Resources/colab_deploy.py). GPU selection and cell execution are performed in the Colab webpage.

### Create a Gmail app password

1. Sign in to the Gmail account entered above and enable Google 2-Step Verification. [Google 2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification)
2. Open the App passwords page and verify your identity if Google asks. [Google App passwords](https://myaccount.google.com/apppasswords)
3. Enter **H3 Studio** as the app name and click **Create**.
4. Copy the generated **16-character app password** into the deployment cell's hidden password field and press Enter. Spaces are removed automatically.

Temporary input remains in the current Colab runtime's memory. To make it available to future runs, add a Colab Secret named `COMFY_GMAIL_APP_PASSWORD`, use the generated app password as its value, and enable notebook access. The script first tries an authorized Secret. If reading it fails, it displays the generation guide and a hidden input field.

If App passwords is unavailable, check that 2-Step Verification is enabled. Organization-managed accounts are also subject to their organization's account settings.

## 3. Connect and generate

The current GUI uses Chinese labels. The corresponding controls are described below.

1. Open **连接设置** (Connection settings). Enter the public URL from the current email, username `comfy`, and the emailed login password.
2. Click **连接远端** (Connect). The app synchronizes the latest 100 images in the remote output directory.
3. The original image and all four reference categories are optional. Enter a text prompt, edit an original image, or use face, styling, clothing, and background references individually or together.
4. Added images appear as thumbnails. Use the top-right `×` to remove an attachment, choose an image size and optional seed, then click **生成图像** (Generate image).
5. View completed images under **远端结果** (Remote results). Results support an enlarged viewer, wheel zoom, drag-to-pan, saving, and copying.
6. **删除远端结果** (Delete remote result) moves the file to a remote trash directory. **撤销删除** (Undo deletion) restores it. Both outputs and trash use the Colab runtime's temporary storage.

Face identity uses generative reference conditioning. Reference generation without an original and background replacement with an original have been tested. Identity similarity, clothing changes, and pose quality need verification with your actual reference images.

### Compute units

On connection, the app reads any saved remote balance baseline. For the first calibration, expand **校准余额 / 费率** (Calibrate balance / rate), enter the current balance and hourly usage shown in Colab's resource panel, and save them to the remote runtime. The app estimates the remaining amount from elapsed time. The Colab panel remains the source for the official balance. Recalibrate after changes to other sessions or usage rates.

## Restarting and stopping

- If the same Colab runtime is still running, open the app and connect with its emailed credentials.
- To redeploy, rerun the deployment cell in your notebook. Existing model files are reused and verified. Missing files are downloaded.
- Creating or deleting runtimes affects temporary files. Save outputs you want to keep to your Mac.
- Temporary Cloudflare URLs can change. Use the latest successful startup email. Anyone holding the URL and password can use the GPU service.
- Closing the Mac app can leave Colab consuming compute units. When finished, disconnect and delete the runtime in Colab. Colab imposes session limits, and the app does not guarantee keep-alive.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `nvidia-smi` is missing | Switch from CPU or TPU to an NVIDIA GPU runtime and rerun. |
| Gmail Secret cannot be read | Check its exact name and notebook access, or enter the app password in the hidden prompt. |
| No login email | Check spam and confirm the sender Gmail matches the app password. An existing service can use the resend script below. |
| “Restoring execution” persists | Check the Colab connection, reconnect to the existing L4 runtime through connection options, and check the output for pending input. |
| HTTP 401 | Use the username and password from the latest email. |
| Expired URL or HTTP 502 | Check that Colab, ComfyUI, and the tunnel are running. Rerun deployment if needed to receive a fresh email. |
| Out of VRAM | Reduce resolution or reference count, or select a GPU with more memory. |

To resend the existing runtime's URL and password, paste [resend_h3_login_email_colab.py](resend_h3_login_email_colab.py) into a new code cell in the same Colab runtime and run it.

## Development checks

Run these commands from the repository root. Python unit tests use the standard library. The viewer test requires Node.js, and the Swift test requires Apple's developer tools.

```sh
python3 -m unittest discover -s tests -v
node --check H3Studio/Resources/app.js
node tests/test_client_viewer.cjs
swiftc H3Studio/Sources/RemoteImage.swift tests/remote_image_metadata.swift -o /tmp/h3-metadata-test
/tmp/h3-metadata-test
```

Native sources are in `H3Studio/Sources`. UI resources and the bundled deployment script are in `H3Studio/Resources`. Standalone ComfyUI extension sources are in `comfyui_h3_reference_edit`, `comfyui_full_canvas_export`, and `comfyui_colab_model_download`. Keep the notebook's code cell synchronized with the bundled deployment script.

## Models and dependencies

Deployment downloads these weights, totaling about 29.4 GB. Refer to each upstream repository for its usage terms.

| Component | File |
| --- | --- |
| Diffusion model | `minimax_h3_image_pruned_w4a8.safetensors` |
| Text encoder | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` |
| VAE | `minimax_h3_image_vae_fp16.safetensors` |

[ComfyUI](https://github.com/Comfy-Org/ComfyUI) · [MiniMax H3 Image weights](https://huggingface.co/Comfy-Org/MiniMax-H3-Image) · [Cloudflared](https://github.com/cloudflare/cloudflared) · [DM Sans font license](H3Studio/Resources/OFL.txt)
