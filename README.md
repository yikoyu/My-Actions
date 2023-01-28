<div align="center">
<h1 align="center">My-Actions</h1>
</div>

# 使用方式

1. 右上角 fork 本仓库
2. 点击 Settings -> Secrets -> 点击绿色按钮 (如无绿色按钮说明已激活。直接到第三步。)
3. 新增 new secret 并设置 Secrets:
4. 双击右上角自己仓库 Star 触发
5. **必须** - 请随便找个文件(例如`README.md`)，加个空格提交一下，否则可能会出现无法定时执行的问题
6. 由于规则更新,可能会 Fork 后会默认禁用,请手动点击 Actions 选择要签到的项目 `enable workflows`激活
7. [定时执行](#定时执行)

# 安装到本地
```sh
git clone https://github.com/yikoyu/My-Actions
poetry install && pre-commit install
```

# 目前模块

1. [贴吧自动签到](./app/tieba.py)
2. [自动打哔咔](./app/bika.py)

# 定时执行

1. 支持手动执行，具体在 Actions 中选中要执行的 Workflows 后再在右侧可以看到 Run workflow，点击即可运行此 workflow。

2. 如果嫌上一步麻烦的，也可以直接点击一下 star，你会发现所有的 workflow 都已执行。

3. 如需修改执行时间自行修改`.github\workflows\`下面的 yaml 内的`cron:` 执行时间为国际标准时间 [时间转换](http://www.timebie.com/cn/universalbeijing.php) 分钟在前 小时在后 尽量提前几分钟,因为下载安装部署环境需要一定时间

##### Cookie 变量设置 Secrets:

| 名称             | 内容                      | 说明                                                                                                                                                                            |
| ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BIKA_USER`      | 哔咔漫画用户名            | 哔咔漫画用户名                                                                                                                                                                  |
| `BIKA_PASS`      | 哔咔漫画密码              | 哔咔漫画密码                                                                                                                                                                    |
| `BDUSS`          | 百度 BDUSS                | # 可分割添加多用户，BDUSS 值切勿使用双击复制 (结尾有一个`符号`双击复制可能无法复制完整)                                                                                                             |
