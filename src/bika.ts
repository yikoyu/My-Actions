import crypto from 'node:crypto'
import process from 'node:process'

// 配置日志
function createLogger() {
  const log = (level: 'info' | 'warn' | 'error', message: string) => {
    const colors = {
      info: '\x1B[32m',
      warn: '\x1B[33m',
      error: '\x1B[31m',
      reset: '\x1B[0m',
    }
    const levelColor = colors[level] || colors.reset
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
    // eslint-disable-next-line no-console
    console.log(`${timestamp} - ${levelColor}${level.toUpperCase().padEnd(5)}${colors.reset} - ${message}`)
  }

  return {
    info: (message: string) => log('info', message),
    warn: (message: string) => log('warn', message),
    error: (message: string) => log('error', message),
  }
}

const logger = createLogger()

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

class BiKa {
  static BASE_URL = 'https://picaapi.picacomic.com/'
  static POST = 'POST'

  static API_PATH = {
    sign_in: 'auth/sign-in',
    punch_in: 'users/punch-in',
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

  async _sendRequest(
    _url: string,
    method: string,
    body: Record<string, string> | null = null,
    token: string | null = null,
  ): Promise<SignInResponse | PunchInResponse> {
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
    const res = await this._sendRequest(BiKa.API_PATH.sign_in, BiKa.POST, body) as SignInResponse
    return res.data.token
  }

  async punchIn(token: string): Promise<PunchInResponse['data']['res']> {
    const res = await this._sendRequest(BiKa.API_PATH.punch_in, BiKa.POST, null, token) as PunchInResponse
    return res.data.res
  }
}

(async () => {
  try {
    const { BIKA_USER, BIKA_PASS } = process.env

    if (!BIKA_USER || !BIKA_PASS) {
      logger.error('未填写哔咔账号密码 取消运行')
      throw new Error('未填写哔咔账号密码')
    }

    const bika = new BiKa()
    const token = await bika.signIn(BIKA_USER, BIKA_PASS)
    const result = await bika.punchIn(token)

    if (result.status === 'ok') {
      logger.info(`打卡成功, 最后一次打卡: ${result.punchInLastDay}`)
    }
    else {
      logger.warn('重复签到 - Already punch-in')
    }
  }
  catch (error) {
    if (error instanceof Error) {
      logger.error(`运行出错: ${error.message}`)
    }
    else {
      logger.error(`运行出错: ${String(error)}`)
    }
    process.exit(1)
  }
})()
