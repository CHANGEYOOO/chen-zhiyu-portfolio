# 媒体上传规则

- 存储空间：`portfolio-media`
- 路径格式：`{section}/{work-id}/{filename}`
- poster：`webp`、`jpg`、`png`，单文件不超过 10 MB
- Livestream 项目图：`webp`、`jpg`、`png`，单文件不超过 20 MB；数量不设上限
- 视频：`mp4`、`webm`，单文件不超过 2 GB
- 大型视频不进入 Git 仓库；前台继续使用媒体 CDN 地址
- 上传失败时保留表单内容，不清空已填写字段
- 归档作品只改变数据库状态，不删除媒体文件
