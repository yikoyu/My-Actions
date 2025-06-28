import crypto from 'node:crypto'
import process from 'node:process'
import { DingtalkRobot } from './utils/dingtalk-robot'
import { Logger } from './utils/logger' // 引入新的日志系统

interface SignInResponse {
  code: number
  data: {
    token: string
  }
}

interface PunchInResponse {
  code: number
  data: {
    res: {
      status: string
      punchInLastDay: string
    }
  }
}

interface ProfileResponse {
  code: number
  message: string
  data: {
    user: {
      birthday: string
      email: string
      gender: string
      name: string
      title: string
      verified: string
      exp: number
      level: number
      characters: string[]
      created_at: string
      isPunched: boolean
      character: string
    }
  }
}

class BiKa {
  static {
    Logger.init('bika')
  }

  static BASE_URL = 'https://picaapi.picacomic.com/'
  static GET = 'GET'
  static POST = 'POST'

  static API_PATH = {
    sign_in: 'auth/sign-in',
    punch_in: 'users/punch-in',
    profile: 'users/profile',
  }

  static API_KEY = 'C69BAF41DA5ABD1FFEDC6D2FEA56B'
  static API_SECRET = '~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn'

  static STATIC_HEADERS = {
    'api-key': BiKa.API_KEY,
    'accept': 'application/vnd.picacomic.com.v1+json',
    'app-channel': '2',
    'app-version': '2.2.1.3.3.4',
    'app-uuid': 'defaultUuid',
    'image-quality': 'original',
    'app-platform': 'android',
    'app-build-version': '45',
    'User-Agent': 'okhttp/3.8.1',
  }

  _encodeSignature(raw: string): string {
    raw = raw.toLowerCase()
    return crypto
      .createHmac('sha256', BiKa.API_SECRET)
      .update(raw)
      .digest('hex')
  }

  async _sendRequest<T>(
    _url: string,
    method: string,
    body: Record<string, string> | null = null,
    token: string | null = null,
  ): Promise<T> {
    const currentTime = Math.floor(Date.now() / 1000).toString()
    const nonce = crypto.randomUUID().replace(/-/g, '')

    const _raw = _url + currentTime + nonce + method + BiKa.API_KEY
    const signature = this._encodeSignature(_raw)

    const headers: Record<string, string> = {
      ...BiKa.STATIC_HEADERS,
      time: currentTime,
      nonce,
      signature,
    }

    if (['POST', 'PUT'].includes(method.toUpperCase())) {
      headers['Content-Type'] = 'application/json; charset=UTF-8'
    }

    if (token) {
      headers.authorization = token
    }

    const url = BiKa.BASE_URL + _url
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.json()

    if (data.code !== 200) {
      throw new Error(data.message)
    }

    return data
  }

  async signIn(email: string, password: string): Promise<string> {
    const body = { email, password }
    const res = await this._sendRequest<SignInResponse>(BiKa.API_PATH.sign_in, BiKa.POST, body)
    return res.data.token
  }

  async punchIn(token: string): Promise<PunchInResponse['data']['res']> {
    const res = await this._sendRequest<PunchInResponse>(BiKa.API_PATH.punch_in, BiKa.POST, null, token)
    return res.data.res
  }

  async profile(token: string): Promise<ProfileResponse['data']['user']> {
    const res = await this._sendRequest<ProfileResponse>(BiKa.API_PATH.profile, BiKa.GET, null, token)
    return res.data.user
  }
}

/**
 * 生成钉钉通知的Markdown消息
 * @param {ProfileResponse['data']['user']} profile - 用户信息
 * @param {PunchInResponse['data']['res']} [result] - 打卡结果（可选）
 * @returns {string} 格式化后的Markdown消息
 */
function generateDingTalkMessage(profile: ProfileResponse['data']['user'], result?: PunchInResponse['data']['res']): string {
  let message = '### 哔咔漫画签到结果\n\n'

  // 显示昵称、等级和经验（按照要求的格式）
  message += `#### 用户信息\n- 昵称: ${profile.name}\n- 等级: ${profile.level}\n- 经验: ${profile.exp}\n\n`

  if (profile.isPunched) {
    message += '#### 签到状态\n- 今日已签到\n'
  }
  else if (result) {
    message += `#### 签到结果\n- 签到状态: ${result.status === 'ok' ? '成功' : '失败'}\n- 最后签到日期: ${result.punchInLastDay}\n`
  }
  else {
    message += '#### 签到状态\n- 签到失败: 未知状态\n'
  }

  return message
}

(async () => {
  try {
    const { BIKA_USER, BIKA_PASS } = process.env

    if (!BIKA_USER || !BIKA_PASS) {
      Logger.error('未填写哔咔账号密码 取消运行')
      throw new Error('未填写哔咔账号密码 取消运行')
    }

    const bika = new BiKa()
    const token = await bika.signIn(BIKA_USER, BIKA_PASS)
    const profile = await bika.profile(token)

    // 显示用户信息（按照要求的格式）
    Logger.info(`用户信息: 昵称=${profile.name}, 等级=${profile.level}, 经验=${profile.exp}`)

    // 已经打过卡
    if (profile.isPunched) {
      Logger.warn('今天已经打过卡')
      // 发送钉钉通知，标题格式：[签到提醒] 哔咔漫画
      await DingtalkRobot.sendMarkdown('[签到提醒] 哔咔漫画', generateDingTalkMessage(profile))
      return
    }

    // 打卡
    const result = await bika.punchIn(token)
    if (result.status === 'ok') {
      Logger.info(`打卡成功, 最后一次打卡: ${result.punchInLastDay}`)
      // 发送钉钉通知，标题格式：[签到提醒] 哔咔漫画
      await DingtalkRobot.sendMarkdown('[签到提醒] 哔咔漫画', generateDingTalkMessage(profile, result))
    }
    else {
      Logger.warn('重复签到 - Already punch-in')
      // 发送钉钉通知，标题格式：[签到提醒] 哔咔漫画
      await DingtalkRobot.sendMarkdown('[签到提醒] 哔咔漫画', generateDingTalkMessage(profile, result))
    }
  }
  catch (error) {
    Logger.error(`运行出错: ${error instanceof Error ? error.message : String(error)}`)
    // 发送钉钉通知，标题格式：[签到提醒] 哔咔漫画
    const sendResult = await DingtalkRobot.sendMarkdown('[签到提醒] 哔咔漫画', `### 哔咔漫画签到结果\n\n运行出错: ${error instanceof Error ? error.message : String(error)}`)
    if (sendResult !== null) {
      Logger.info('异常通知已发送至钉钉')
    }
    process.exit(1)
  }
})()
