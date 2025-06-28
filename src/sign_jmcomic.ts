/**
 * JMComic 自动签到脚本
 *
 * 功能特点:
 * - 支持两种登录方式：Cookie 登录和账号密码登录
 * - 自动检测 Cookie 有效性，失效时自动使用账号密码登录
 * - 登录成功后自动更新 GitHub Secrets 中的 Cookie，保持长期有效
 * - 通过钉钉机器人推送详细的签到结果，包括奖励信息和执行状态
 * - 完整的错误处理和日志记录，便于排查问题
 *
 * 配置说明:
 * 方式一：使用 Cookie 登录（推荐）
 * 1. 首先在浏览器登录 JMComic 网站
 * 2. 使用浏览器开发者工具（F12）获取 Cookie
 * 3. 在 GitHub Secrets 中设置 `JMCOMIC_COOKIE` 变量
 *
 * 方式二：使用账号密码登录
 * 1. 在 GitHub Secrets 中设置 `JMCOMIC_USERNAME` 和 `JMCOMIC_PASSWORD` 变量
 * 2. 程序会在 Cookie 失效时自动使用账号密码登录并更新 Cookie
 *
 * 高级配置:
 * - GitHub Token 配置：设置 `GH_TOKEN` 以便在使用账号密码登录后自动更新 Cookie
 * - 钉钉通知配置：设置 `DINGTALK_ACCESS_TOKEN` 以接收签到结果通知
 *
 * 钉钉通知示例:
 * [签到提醒] JMComic
 * ### ✅ 签到成功
 * - **奖励**: 您已经完成每日签到，获得 [ JCoin:20 ]  [ EXP:20 ]
 * - **登录方式**: 账号密码
 * - **Cookie状态**: 已更新到GitHub Secrets
 *
 * 🕒 2025年6月28日 16:38:46
 *
 */

import process from 'node:process'
import { CookieManager } from './utils/cookie'
import { DingtalkRobot } from './utils/dingtalk-robot'
import { GitHubAPI } from './utils/github-api'
import { Logger } from './utils/logger'

/**
 * JMComic 签到工具类
 * @class
 */
class JMComicSignTool {
  /**
   * 配置信息
   * @type {{ LOGIN_URL: string; SIGN_URL: string; USER_AGENT: string }}
   */
  static CONFIG: { LOGIN_URL: string, SIGN_URL: string, USER_AGENT: string } = {
    LOGIN_URL: 'https://18comic-wantgo.org/login',
    SIGN_URL: 'https://18comic-wantgo.org/ajax/user_daily_sign',
    USER_AGENT: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36 EdgA/137.0.0.0',
  }

  /**
   * 构建请求头
   * @returns {Record<string, string>} - 包含请求头的对象
   */
  static buildHeaders(): Record<string, string> {
    return {
      'User-Agent': this.CONFIG.USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Cookie': CookieManager.getCookieHeader(),
    }
  }

  /**
   * 登录方法
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<boolean>} - 登录成功返回true，失败返回false
   */
  static async login(username: string, password: string): Promise<boolean> {
    const payload = new URLSearchParams({
      username,
      password,
      id_remember: 'on',
      login_remember: 'on',
      submit_login: '1',
    })

    try {
      const response = await fetch(this.CONFIG.LOGIN_URL, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: payload.toString(),
      })

      // 调试：记录登录请求响应状态码
      Logger.debug(`登录请求响应状态码: ${response.status}`)

      CookieManager.parseCookies(response)
      Logger.debug(`登录设置Cookie后: ${CookieManager.getCookieHeader()}`)

      if (response.status === 200) {
        const responseData: { status: number, errors: string[] } = await response.json()

        // 调试：记录登录响应数据
        Logger.debug(`登录响应数据: ${JSON.stringify(responseData)}`)

        // 成功 {"status":1,"errors":["https:\/\/18comic-wantgo.org"]}
        // 失败 {"status":2,"errors":["\u65e0\u6548\u7684\u7528\u6237\u540d\u548c\/\u6216\u5bc6\u7801!"]}
        return responseData.status === 1
      }

      return false
    }
    catch (error) {
      Logger.error(`登录请求异常: ${(error as Error).message}`)
      return false
    }
  }

  /**
   * 签到方法
   * @returns {Promise<{ success: boolean; message: string; code: number }>} - 签到结果对象
   */
  static async sign(): Promise<{ success: boolean, message: string, code: number }> {
    try {
      const response = await fetch(this.CONFIG.SIGN_URL, {
        method: 'POST',
        headers: this.buildHeaders(),
      })

      // 调试：记录签到请求响应状态码
      Logger.debug(`签到请求响应状态码: ${response.status}`)

      CookieManager.parseCookies(response)
      Logger.debug(`签到设置Cookie后: ${CookieManager.getCookieHeader()}`)
      const signData: { msg: string, error?: string } = await response.json()

      // 调试：记录签到响应数据
      Logger.debug(`签到响应数据: ${JSON.stringify(signData)}`)

      // 返回 {"msg":""} 没有登录
      // 返回 {"msg":"","error":"finished"} 已经签到过了
      // 返回 {"msg":"\u60a8\u5df2\u7d93\u5b8c\u6210\u6bcf\u65e5\u7c3d\u5230\uff0c\u7372\u5f97 [ JCoin:20 ]  [ EXP:20 ] \n"} 签到成功
      // 定义状态码: 0=未登录, 1=已签到, 2=签到成功
      if (!signData.msg && !signData.error) {
        return { success: false, message: '未登录', code: 0 }
      }
      else if ('error' in signData) {
        return { success: false, message: signData.error || '已签到', code: 1 }
      }
      else {
        return { success: true, message: signData.msg, code: 2 }
      }
    }
    catch (error) {
      Logger.error(`签到请求异常: ${(error as Error).message}`)
      return { success: false, message: '签到异常', code: -1 }
    }
  }

  /**
   * 执行完整签到流程
   * @param {{ username?: string; password?: string; cookie?: string }} options - 配置选项
   * @returns {Promise<{ success: boolean; login: boolean; sign: { success: boolean; message: string; code: number }; error?: string }>} - 完整执行结果
   */
  static async executeSignFlow(options: { username?: string, password?: string, cookie?: string } = {}): Promise<{
    success: boolean
    login: boolean
    sign: { success: boolean, message: string, code: number }
    error?: string
  }> {
    try {
      // 调试：记录当前Cookie状态
      Logger.debug(`当前Cookie: ${CookieManager.getCookieHeader()}`)

      // 确保开始时Cookie为空
      CookieManager.clear()

      // 步骤1: 尝试使用Cookie签到（如果提供）
      if (options.cookie) {
        Logger.info('尝试使用提供的Cookie...')
        CookieManager.setCookiesFromString(options.cookie)

        // 调试：记录设置后的Cookie
        Logger.debug(`设置Cookie后: ${CookieManager.getCookieHeader()}`)

        const signResult = await this.sign()

        // 调试：记录Cookie签到结果
        Logger.debug(`Cookie签到结果: ${JSON.stringify(signResult)}`)

        // 签到成功或已签到，直接返回结果
        if (signResult.code === 2 || signResult.code === 1) {
          return {
            success: true,
            login: false,
            sign: signResult,
          }
        }

        // 未登录，检查是否可以使用账号密码
        if (signResult.code === 0 && options.username && options.password) {
          Logger.warn('Cookie无效或已过期，准备使用账号密码登录...')
        }
        else {
          // 其他错误，直接失败
          throw new Error(`签到异常: ${signResult.message}`)
        }
      }

      // 步骤2: 使用账号密码登录（如果提供）
      if (options.username && options.password) {
        // 清除可能存在的无效Cookie
        CookieManager.clear()

        Logger.info('使用用户名和密码登录...')
        const loginSuccess = await this.login(options.username, options.password)

        // 调试：记录登录结果
        Logger.debug(`账号密码登录结果: ${loginSuccess}`)

        if (!loginSuccess) {
          throw new Error('账号密码登录失败')
        }

        Logger.info('登录成功，再次尝试签到...')
        const signResult = await this.sign()

        // 调试：记录登录后签到结果
        Logger.debug(`登录后签到结果: ${JSON.stringify(signResult)}`)

        // 签到成功或已签到
        if (signResult.code === 2 || signResult.code === 1) {
          // 获取新的Cookie并更新到GitHub
          await updateGitHubCookie()

          return {
            success: true,
            login: true,
            sign: signResult,
          }
        }

        // 其他错误
        throw new Error(`登录后签到失败: ${signResult.message}`)
      }

      // 没有提供有效的认证方式
      throw new Error('必须提供有效的Cookie或用户名和密码')
    }
    catch (error: unknown) {
      return {
        success: false,
        login: false,
        sign: { success: false, message: '签到流程失败', code: -1 },
        error: (error as Error).message,
      }
    }
  }
}

// 更新GitHub上的JMCOMIC_COOKIE变量
async function updateGitHubCookie() {
  try {
    const githubToken = process.env.GH_TOKEN
    if (!githubToken) {
      Logger.warn('未设置GH_TOKEN环境变量，跳过更新GitHub Cookie')
      return
    }

    // 获取当前Cookie
    const currentCookie = CookieManager.getCookieHeader()
    if (!currentCookie) {
      Logger.warn('当前没有有效的Cookie，无法更新到GitHub')
      return
    }

    Logger.info('开始更新GitHub上的JMCOMIC_COOKIE变量...')

    // 调试：记录要更新的Cookie
    Logger.debug(`更新到GitHub的Cookie: ${currentCookie}`)

    await GitHubAPI.createOrUpdateSecret(
      githubToken,
      'JMCOMIC_COOKIE',
      currentCookie,
    )

    // 调试：记录GitHub API响应
    Logger.debug('GitHub API调用成功')

    Logger.info('成功更新GitHub上的JMCOMIC_COOKIE变量')
  }
  catch (error) {
    Logger.error(`更新GitHub Cookie失败: ${(error as Error).message}`)
  }
}

// 发送钉钉通知
async function sendDingtalkNotification(result: {
  success: boolean
  login: boolean
  sign: { success: boolean, message: string, code: number }
  error?: string
}) {
  try {
    const dingtalkToken = process.env.DINGTALK_ACCESS_TOKEN
    if (!dingtalkToken) {
      Logger.warn('未设置DINGTALK_ACCESS_TOKEN环境变量，跳过发送钉钉通知')
      return
    }

    // 确保消息以[签到提醒]开头
    let messageContent = `[签到提醒] JMComic\n\n`

    if (result.success) {
      // 成功场景
      messageContent += `### ✅ 签到成功\n`

      if (result.sign.code === 2) {
        // 实际签到成功
        messageContent += `- **奖励**: ${result.sign.message}\n`
        messageContent += `- **登录方式**: ${result.login ? '账号密码' : 'Cookie'}\n`
      }
      else if (result.sign.code === 1) {
        // 今日已签到
        messageContent += `- **状态**: 今日已签到，无需重复操作\n`
        messageContent += `- **登录方式**: ${result.login ? '账号密码' : 'Cookie'}\n`
      }

      // 显示GitHub更新状态
      if (result.login && process.env.GH_TOKEN) {
        messageContent += `- **Cookie状态**: 已更新到GitHub Secrets\n`
      }
    }
    else {
      // 失败场景
      messageContent += `### ❌ 签到失败\n`
      messageContent += `- **错误信息**: ${result.error || '未知错误'}\n`
    }

    // 添加时间戳
    messageContent += `\n> 🕒 ${new Date().toLocaleString()}`

    Logger.info('发送钉钉通知中...')

    // 调试：记录钉钉通知内容
    Logger.debug(`钉钉通知内容: ${messageContent}`)

    const dingtalkResult = await DingtalkRobot.sendMarkdown(
      'JMComic签到通知',
      messageContent,
    )

    // 调试：记录钉钉通知结果
    Logger.debug(`钉钉通知结果: ${JSON.stringify(dingtalkResult)}`)

    if (dingtalkResult) {
      Logger.info('钉钉通知发送成功')
    }
    else {
      Logger.warn('钉钉通知发送失败，可能是未设置DINGTALK_ACCESS_TOKEN')
    }
  }
  catch (error) {
    Logger.error(`发送钉钉通知失败: ${(error as Error).message}`)
  }
}

// 主程序入口
(async () => {
  // 初始化日志器
  Logger.init('jmcomic-sign-bot')
  Logger.group('===== JMComic自动签到程序启动 =====')

  try {
    // 从环境变量获取配置
    const options: { username?: string, password?: string, cookie?: string } = {
      username: process.env.JMCOMIC_USERNAME,
      password: process.env.JMCOMIC_PASSWORD,
      cookie: process.env.JMCOMIC_COOKIE,
    }

    // 调试：记录配置信息
    Logger.debug(`配置信息: ${JSON.stringify(options)}`)

    // 验证至少提供了cookie或用户名/密码
    if (!options.cookie && (!options.username || !options.password)) {
      throw new Error('请设置JMCOMIC_COOKIE环境变量，或同时设置JMCOMIC_USERNAME和JMCOMIC_PASSWORD环境变量')
    }

    Logger.info('配置验证通过，开始执行签到流程')
    const result = await JMComicSignTool.executeSignFlow(options)

    // 调试：记录完整流程结果
    Logger.debug(`签到流程结果: ${JSON.stringify(result)}`)

    if (!result.success) {
      throw new Error(result.error || '签到流程失败')
    }

    // 发送钉钉通知
    await sendDingtalkNotification(result)

    // 输出最终结果
    Logger.group('===== 签到程序执行结果 =====')
    if (result.sign.code === 2) {
      Logger.info('签到成功')
      Logger.info(`奖励: ${result.sign.message}`)
    }
    else if (result.sign.code === 1) {
      Logger.warn('今日已签到')
    }
    else {
      Logger.error(`未知状态码: ${result.sign.code}`)
    }
    Logger.groupEnd('===== 签到程序执行结束 =====')

    process.exit(0)
  }
  catch (error) {
    Logger.group('===== 签到程序执行失败 =====')
    Logger.error((error as Error).message)

    // 发送失败通知
    await sendDingtalkNotification({
      success: false,
      login: false,
      sign: { success: false, message: '签到失败', code: -1 },
      error: (error as Error).message,
    })

    Logger.groupEnd('===== 签到程序异常终止 =====')
    process.exit(1)
  }
})()
