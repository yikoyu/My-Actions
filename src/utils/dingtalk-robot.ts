import process from 'node:process'

/**
 * 钉钉机器人工具类，用于发送消息到钉钉群
 */
export class DingtalkRobot {
  /**
   * 从环境变量中获取的accessToken，用于API认证
   */
  private static getAccessToken(): string | null {
    const token = process.env.DINGTALK_ACCESS_TOKEN

    if (!token) {
      console.warn('警告：未找到环境变量 DINGTALK_ACCESS_TOKEN，将无法发送钉钉通知')
      return null
    }

    return token
  }

  /**
   * 发送Markdown格式的消息到钉钉群
   * @param {string} title - 消息标题，显示在通知栏和消息顶部
   * @param {string} content - Markdown格式的消息内容
   * @returns {Promise<{ errcode: number; errmsg: string }> | null} 钉钉API的响应结果，若无token则返回null
   * @example
   * await DingtalkRobot.sendMarkdown("系统通知", "## 服务器状态\n- CPU: 15%\n- 内存: 30%");
   */
  public static async sendMarkdown(
    title: string,
    content: string,
  ): Promise<{ errcode: number, errmsg: string } | null> {
    // 获取accessToken（可能返回null）
    const accessToken = this.getAccessToken()
    if (!accessToken)
      return null

    // 构建请求URL
    const url = `https://oapi.dingtalk.com/robot/send?access_token=${accessToken}`

    // 构建请求体
    const requestBody = {
      msgtype: 'markdown',
      markdown: {
        title,
        text: content,
      },
    }

    try {
      // 发送请求
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      // 检查HTTP状态码
      if (!response.ok) {
        throw new Error(`HTTP错误，状态码：${response.status}`)
      }

      // 解析响应数据
      const data = await response.json()

      // 检查钉钉API返回结果
      if (data.errcode !== 0) {
        throw new Error(`钉钉API错误：${data.errmsg} (${data.errcode})`)
      }

      return data
    }
    catch (error) {
      // 使用三元表达式处理unknown类型的错误
      console.error(
        '发送钉钉消息失败:',
        error instanceof Error ? error.message : String(error),
      )
      throw error // 将错误继续抛出，便于上层处理
    }
  }
}
