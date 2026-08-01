# 作品内容模型

后台只管理当前作品页真正展示的信息，不引入额外项目档案字段。

## TVC

- `brand_name`：品牌名，对应作品封面下方左侧文字
- `work_title`：影片名，对应作品封面下方主标题
- `work_type`：作品类型，对应作品封面下方右侧文字
- `poster_url`：封面图
- `video_url`：点击播放时使用的视频地址
- `sort_order`：作品顺序
- `status`：草稿、已发布或已归档

## Livestream

- `work_title`：直播名
- `work_type`：类型
- `poster_url`：项目首张封面，可从项目图片中选择
- `work_images`：项目图片列表，数量不设上限
- `sort_order`：项目顺序
- `status`：草稿、已发布或已归档

直播间不使用 `brand_name`。年份、客户、角色、简介和详情页字段不进入第一阶段。
