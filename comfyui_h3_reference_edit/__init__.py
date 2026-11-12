"""Reference-role controls for ComfyUI's native MiniMax H3 Image node."""
from comfy_extras.nodes_minimax_h3 import MiniMaxH3ImageConditioning


REFERENCE_ROLES = (
    ('face', '换脸', 'Replace the main subject\'s face using the facial identity in {picture}. Match the expression, skin detail and lighting naturally.'),
    ('style', '造型', 'Use the hairstyle, makeup, body pose and styling in {picture} for the main subject.'),
    ('clothing', '换衣', 'Dress the main subject in the outfit from {picture}. Reproduce the garment design, colors, fabric and fit.'),
    ('background', '背景', 'Replace the background with the setting in {picture}. Integrate the main subject with the scene perspective, lighting and contact shadows.'),
)


class H3ReferenceEdit:
    @classmethod
    def INPUT_TYPES(cls):
        required = {
            'clip': ('CLIP',),
            'vae': ('VAE',),
            'instructions': ('STRING', {'multiline': True, 'default': 'Produce a coherent edit with natural lighting and matching perspective.'}),
            'width': ('INT', {'default': 2048, 'min': 512, 'max': 8192, 'step': 32}),
            'height': ('INT', {'default': 2048, 'min': 512, 'max': 8192, 'step': 32}),
        }
        for role, label, _ in REFERENCE_ROLES:
            required[role + '_enabled'] = ('BOOLEAN', {'default': False, 'label_on': label + ' 开', 'label_off': label + ' 关'})
        optional = {'base_image': ('IMAGE', {'lazy': True})}
        optional.update({role + '_reference': ('IMAGE', {'lazy': True}) for role, _, _ in REFERENCE_ROLES})
        return {'required': required, 'optional': optional}

    RETURN_TYPES = ('CONDITIONING', 'LATENT', 'STRING')
    RETURN_NAMES = ('positive', 'latent', 'reference_prompt')
    FUNCTION = 'encode'
    CATEGORY = 'MiniMax H3/Reference Edit'
    DESCRIPTION = '可选原图和人脸、造型、衣服、背景参考图。开启对应开关前先上传参考图。'

    def check_lazy_status(self, **inputs):
        required = ['base_image'] if 'base_image' in inputs and inputs['base_image'] is None else []
        return required + [
            role + '_reference'
            for role, _, _ in REFERENCE_ROLES
            if inputs.get(role + '_enabled') and role + '_reference' in inputs and inputs[role + '_reference'] is None
        ]

    def encode(self, clip, vae, instructions, width, height, base_image=None, **inputs):
        references = {}
        if base_image is not None:
            references['image_1'] = base_image
            directions = [
                'Use <Picture 1> as the base image to edit.',
                'Keep the composition and details consistent with the base image while applying the requested edits.',
            ]
        else:
            directions = ['Generate a new image using the following instructions and enabled references.']
        for role, label, direction in REFERENCE_ROLES:
            if not inputs.get(role + '_enabled'):
                continue
            reference = inputs.get(role + '_reference')
            if reference is None:
                raise ValueError(f'已启用{label}，请上传并连接对应参考图。')
            number = len(references) + 1
            references[f'image_{number}'] = reference
            directions.append(direction.format(picture=f'<Picture {number}>'))
        if inputs.get('face_enabled') and inputs.get('style_enabled'):
            directions.append('Use the face reference for facial identity and the styling reference for hairstyle, makeup and pose.')
        if inputs.get('style_enabled') and inputs.get('clothing_enabled'):
            directions.append('Use the clothing reference for the outfit and the styling reference for hairstyle, makeup and pose.')
        if instructions.strip():
            directions.append('Additional editing instructions: ' + instructions.strip())
        if not references and not instructions.strip():
            raise ValueError('请填写生成指令或提供至少一张启用的参考图。')
        prompt = '\n'.join(directions)
        output = MiniMaxH3ImageConditioning.execute(
            clip=clip, vae=vae, prompt=prompt, width=width, height=height, images=references
        )
        positive, latent = output.result
        return positive, latent, prompt


NODE_CLASS_MAPPINGS = {'H3ReferenceEdit': H3ReferenceEdit}
NODE_DISPLAY_NAME_MAPPINGS = {'H3ReferenceEdit': 'H3 参考图编辑 · 换脸 / 造型 / 换衣 / 背景'}
WEB_DIRECTORY = './web'

# Register result routes when ComfyUI imports this package.
from . import result_routes
