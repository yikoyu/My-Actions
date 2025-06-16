import { Buffer } from 'node:buffer'
import { createCipheriv } from 'node:crypto'
import process from 'node:process'

/**
 * 联想延保签到工具类
 * 提供联想账号登录、会话获取及每日签到功能
 */
class LenovoSignIn {
  // 基础设备信息（非敏感）
  private static baseInfo = 'eyJpbWVpIjoiODY1MzE1MDMxOTg1ODc4IiwicGhvbmVicmFuZCI6Imhvbm9yIiwicGhvbmVNb2RlbCI6IkZSRC1BTDEwIiwiYXBwVmVyc2lvbiI6IlY0LjIuNSIsInBob25laW5jcmVtZW50YWwiOiI1NTYoQzAwKSIsIlBhZ2VJbmZvIjoiTXlJbmZvcm1hdGlvbkFjdGlvbkltcGwiLCJwaG9uZWRpc3BsYXkiOiJGUkQtQUwxMCA4LjAuMC41NTYoQzAwKSIsInBob25lTWFudWZhY3R1cmVyIjoiSFVBV0VJIiwibGVub3ZvQ2x1YkNoYW5uZWwiOiJ5aW5neW9uZ2JhbyIsImxvZ2luTmFtZSI6IjE3NjQwNDA4NTM3IiwicGhvbmVwcm9kdWN0IjoiRlJELUFMMTAiLCJzeXN0ZW1WZXJzaW9uIjoiOC4wLjAiLCJhbmRyb2lkc2RrdmVyc2lvbiI6IjI2In0='

  // 解析后的设备信息
  private static deviceInfo = JSON.parse(Buffer.from(this.baseInfo, 'base64').toString('utf8'))

  // 设备ID
  private static deviceId = this.deviceInfo.imei

  // API端点定义
  private static apiUrls = {
    login: `https://uss.lenovomm.com/authen/1.2/tgt/user/get?msisdn=`,
    session: 'https://api.club.lenovo.cn/users/getSessionID',
    signIn: 'https://api.club.lenovo.cn/signin/v2/add',
  }

  // 请求头定义（不包含账号密码）
  private static requestHeaders = {
    'baseinfo': this.baseInfo,
    'unique': this.deviceId,
    'User-Agent': 'LenovoClub/4.1.2 (iPad; iOS 13.6; Scale/2.00)',
    'token': '',
    'Authorization': '',
    'itemid': '1',
    'sversion': '0',
    'X-Lenovo-APPID': '1',
    'versionCode': '1000082',
  }

  /**
   * 屏蔽敏感信息
   * @param data 原始数据
   * @param sensitiveKeys 敏感字段数组
   * @returns 脱敏后的数据
   */
  private static maskSensitiveData(data: any, sensitiveKeys: string[] = ['loginToken', 'sessionId', 'token', 'lenovoId']): any {
    if (!data || typeof data !== 'object')
      return data

    const maskedData = { ...data }
    sensitiveKeys.forEach((key) => {
      if (maskedData[key]) {
        // 部分屏蔽：保留前4位和后4位，中间用*代替
        const value = String(maskedData[key])
        if (value.length > 8) {
          maskedData[key] = `${value.substr(0, 4)}${'*'.repeat(value.length - 8)}${value.substr(value.length - 4)}`
        }
        else {
          maskedData[key] = '[已屏蔽]'
        }
      }
    })
    return maskedData
  }

  /**
   * AES加密处理
   * @param text 待加密文本
   * @returns 加密后的十六进制字符串
   */
  private static aesEncrypt(text: string): string {
    const key = Buffer.from('nihao_liu#zh*9@7', 'utf8')
    const iv = Buffer.from('A*8@Stii_jin)*%6', 'utf8')
    const cipher = createCipheriv('aes-128-cbc', key, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return encrypted
  }

  /**
   * 记录操作日志（自动屏蔽敏感信息）
   * @param level 日志级别
   * @param message 日志内容
   * @param data 附加数据
   */
  private static log(level: 'INFO' | 'ERROR' | 'DEBUG', message: string, data?: any): void {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const logPrefix = `[${timestamp}] [${level}] [联想延保签到]`

    // 屏蔽敏感数据后输出
    const maskedData = data ? this.maskSensitiveData(data) : null

    if (maskedData) {
      console.log(`${logPrefix} ${message}`, maskedData)
    }
    else {
      console.log(`${logPrefix} ${message}`)
    }
  }

  /**
   * 执行账号登录（通过参数传入账号密码）
   * @param account 账号
   * @param password 密码
   * @returns 登录凭证或null
   */
  private static async login(account: string, password: string): Promise<string | null> {
    this.log('INFO', '开始执行账号登录')
    let loginToken: string | null = null

    try {
      // 构建登录请求数据
      const loginData = `lang=zh-CN-%23Hans&source=android%3Acom.lenovo.club.app-V4.2.5&deviceidtype=mac&deviceid=${this.deviceId}&devicecategory=unknown&devicevendor=${this.deviceInfo.phoneManufacturer}&devicefamily=unknown&devicemodel=${this.deviceInfo.phoneModel}&osversion=${this.deviceInfo.systemVersion}&osname=Android&password=${password}`

      // 拼接带账号的登录URL
      const loginUrl = `${this.apiUrls.login}${account}`

      // 第一次请求获取临时登录凭证
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: loginData,
      })

      const loginText = await loginResponse.text()
      const loginTokenMatch = loginText.match(/<Value>(.+?)<\/Value>/)

      if (loginTokenMatch) {
        // 第二次请求获取最终登录凭证
        const stResponse = await fetch(`https://uss.lenovomm.com/authen/1.2/st/get?lpsutgt=${loginTokenMatch[1]}&source=ios%3Alenovo%3Aclub%3A4.1.0&lang=zh-CN&realm=club.lenovo.com.cn`)
        const stText = await stResponse.text()
        const stTokenMatch = stText.match(/<Value>(.+?)<\/Value>/)
        loginToken = stTokenMatch ? stTokenMatch[1] : null
      }

      this.log('INFO', '账号登录成功', { loginToken })
      return loginToken
    }
    catch (error) {
      this.log('ERROR', '账号登录失败', error)
      return null
    }
  }

  /**
   * 获取会话信息
   * @param loginToken 登录凭证
   * @returns 会话信息或null
   */
  private static async fetchSession(loginToken: string | null): Promise<{ lenovoId: string, sessionId: string, token: string } | null> {
    this.log('INFO', '开始获取会话信息')

    if (!loginToken) {
      this.log('ERROR', '获取会话信息失败: 缺少登录凭证')
      return null
    }

    try {
      // 更新请求头
      this.requestHeaders.Authorization = `Lenovosso ${loginToken}`
      this.requestHeaders.token = loginToken

      // 构建会话请求参数
      const sessionParam = this.aesEncrypt(`{"sessionid":"Lenovosso ${loginToken}","time":"${new Date().getTime()}"}`)
      const sessionUrl = `${this.apiUrls.session}?s=${sessionParam}`

      // 发送会话请求
      const sessionResponse = await fetch(sessionUrl, { headers: this.requestHeaders })
      const sessionData = await sessionResponse.json()

      const sessionInfo = {
        lenovoId: sessionData.res.lenovoid,
        sessionId: sessionData.res.sessionid,
        token: sessionData.res.token,
      }

      this.log('DEBUG', '会话信息获取成功', sessionInfo)
      return sessionInfo
    }
    catch (error) {
      this.log('ERROR', '会话信息获取失败', error)
      return null
    }
  }

  /**
   * 执行每日签到
   * @param sessionInfo 会话信息
   * @param sessionInfo.lenovoId 联想账号ID
   * @param sessionInfo.sessionId 会话ID
   * @param sessionInfo.token 会话令牌
   * @returns 签到结果描述
   */
  private static async performSignIn(sessionInfo: { lenovoId: string, sessionId: string, token: string }): Promise<string> {
    this.log('INFO', '开始执行每日签到')

    try {
    // 更新请求头
      this.requestHeaders.Authorization = `Lenovo ${sessionInfo.sessionId}`
      this.requestHeaders.token = sessionInfo.token
      this.requestHeaders['User-Agent'] = 'Apache-HttpClient/UNAVAILABLE (java 1.5)'

      // 构建签到请求数据
      const signData = this.aesEncrypt(`{"uid":"${sessionInfo.lenovoId}","imei":"${this.deviceId}","source":"0","sessionid":"Lenovo ${sessionInfo.sessionId}","time":"${new Date().getTime()}"}`)

      // 发送签到请求
      const signResponse = await fetch(this.apiUrls.signIn, {
        method: 'POST',
        headers: this.requestHeaders,
        body: signData,
      })

      const signResult = await signResponse.json()
      this.log('DEBUG', '签到请求返回', signResult)

      if (typeof signResult === 'object') {
      // 处理重复签到的情况
        if (signResult.status === 1 && signResult.res?.error_code === 20813) {
          this.log('INFO', '今日已完成签到', signResult.res)
          return '今日已完成签到，无需重复操作'
        }

        // 处理正常签到成功的情况
        if (signResult.status === 0 && signResult.res?.success) {
          const rewardTips = signResult.res.rewardTips.replace(/\\n/g, ' | ')
          this.log('INFO', '签到成功', {
            reward: rewardTips,
            continueDays: signResult.res.continueCount,
          })
          return `签到成功！获得奖励：${rewardTips} | 连续签到 ${signResult.res.continueCount} 天`
        }

        // 处理其他错误情况
        const errorMsg = signResult.res?.error_CN
          ? decodeURIComponent(signResult.res.error_CN)
          : signResult.res?.error || '未知错误'

        this.log('ERROR', '签到请求失败', {
          status: signResult.status,
          errorCode: signResult.res?.error_code,
          errorMsg,
        })

        return `签到请求失败：${errorMsg} (错误码: ${signResult.res?.error_code})`
      }

      // 非预期的返回格式
      this.log('ERROR', '签到请求返回格式异常', signResult)
      return '签到请求返回格式异常，请检查日志'
    }
    catch (error) {
      this.log('ERROR', '签到过程发生错误', error)
      return '签到过程发生错误，请检查日志获取详细信息'
    }
  }

  /**
   * 执行完整的签到流程（通过参数传入账号密码）
   * @param account 账号
   * @param password 密码
   * @returns 签到结果摘要
   */
  public static async execute(account: string, password: string): Promise<string> {
    this.log('INFO', '联想延保签到任务开始')
    let resultSummary = '联想延保签到任务执行结果：'

    try {
      // 1. 执行账号登录
      const loginToken = await this.login(account, password)
      if (!loginToken) {
        resultSummary += '登录失败，无法继续执行签到任务'
        this.log('ERROR', resultSummary)
        return resultSummary
      }

      // 2. 获取会话信息
      const sessionInfo = await this.fetchSession(loginToken)
      if (!sessionInfo) {
        resultSummary += '会话信息获取失败，无法继续执行签到任务'
        this.log('ERROR', resultSummary)
        return resultSummary
      }

      // 3. 执行每日签到
      const signResult = await this.performSignIn(sessionInfo)
      resultSummary += signResult
      this.log('INFO', resultSummary)
    }
    catch (error) {
      resultSummary += '任务执行过程中发生异常'
      this.log('ERROR', resultSummary, error)
    }

    return resultSummary
  }
}

(() => {
  const { LENOVO_USER = '', LENOVO_PASS = '' } = process.env
  LenovoSignIn.execute(LENOVO_USER, LENOVO_PASS)
    .then(result => console.log(`\n===== 任务执行结果 =====\n${result}`))
    .catch((error) => {
      console.error(`\n===== 任务执行异常 =====\n${error}`)
      process.exit(1)
    })
})()
