import { createHash } from 'node:crypto'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

// 优化后的日志系统
function createLogger(name: string) {
  const formatTime = () => new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  // 字符串填充到指定长度
  const padString = (str: string, length: number) => {
    return str.padEnd(length, ' ')
  }

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'INFO': return '\x1B[32m' // 绿色
      case 'ERROR': return '\x1B[31m' // 红色
      case 'WARN': return '\x1B[33m' // 黄色
      case 'DEBUG': return '\x1B[36m' // 青色
      default: return '\x1B[0m' // 重置
    }
  }

  const log = (level: string, message: string, prefix = '') => {
    const time = formatTime()
    const levelColor = getLevelColor(level)
    const resetColor = '\x1B[0m'
    // eslint-disable-next-line no-console
    console.log(`${levelColor}[${time}] [${padString(level, 5)}] [${name}]${prefix} ${message}${resetColor}`)
  }

  return {
    info: (message: string) => log('INFO', message),
    error: (message: string) => log('ERROR', message),
    warn: (message: string) => log('WARN', message),
    debug: (message: string) => log('DEBUG', message),
    group: (title: string, index?: number, total?: number) => {
      const indexStr = index !== undefined && total !== undefined ? ` (${index}/${total})` : ''
      log('INFO', title + indexStr)
    },
    groupEnd: (title: string) => {
      log('INFO', title)
      // eslint-disable-next-line no-console
      console.log() // 添加空行分隔
    },
    signResult: (forumName: string, index: number, total: number, result: any) => {
      const code = result.error_code || '200'
      const status = code === '0' ? '成功' : '失败'
      const color = code === '0' ? '\x1B[32m' : '\x1B[31m'
      const reset = '\x1B[0m'

      log('INFO', `签到 "${forumName}" 贴吧 (${index}/${total}) ${color}[${status}]${reset}`)
      log('DEBUG', `  结果码: ${code}`)
      log('DEBUG', `  提示信息: ${result.error_msg || '无'}`)

      // 处理签到成功的详细信息
      if (code === '0' && result.user_info) {
        const userInfo = result.user_info
        log('INFO', '  用户签到详情:')
        log('INFO', `    签到排名: ${userInfo.user_sign_rank}`)
        log('INFO', `    连续签到: ${userInfo.cont_sign_num} 天`)
        log('INFO', `    总签到数: ${userInfo.total_sign_num} 次`)
        log('INFO', `    本次获得经验: ${userInfo.sign_bonus_point}`)
        log('INFO', `    当前等级: ${userInfo.level_name} (${userInfo.levelup_score}经验升级)`)
      }

      // eslint-disable-next-line no-console
      console.log()
    },
  }
}

// 常量定义
const HEADERS = {
  'Host': 'tieba.baidu.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.71 Safari/537.36',
}

const SIGN_DATA = {
  _client_type: '2',
  _client_version: '9.7.8.0',
  _phone_imei: '000000000000000',
  model: 'MI+5',
  net_type: '1',
}

// API URL
const LIKE_URL = 'http://c.tieba.baidu.com/c/f/forum/like'
const TBS_URL = 'http://tieba.baidu.com/dc/common/tbs'
const SIGN_URL = 'http://c.tieba.baidu.com/c/c/forum/sign'

// 贴吧信息接口
interface Forum {
  id: string
  name: string
  // 其他可能的字段
}

// 签到结果接口
interface SignResult {
  error_code?: string
  error_msg?: string
  time?: number
  user_info?: {
    user_sign_rank: string
    cont_sign_num: string
    total_sign_num: string
    sign_bonus_point: string
    level_name: string
    levelup_score: string
  }
  // 其他可能的字段
}

export class TiebaAutoSign {
  private static readonly logger = createLogger('tieba')
  private static readonly SIGN_KEY = 'tiebaclient!!!'

  // 编码请求数据并生成签名
  private static encodeData(data: Record<string, string>): Record<string, string> {
    const sortedKeys = Object.keys(data).sort()
    let signStr = ''

    sortedKeys.forEach((key) => {
      signStr += `${key}=${data[key]}`
    })

    signStr += this.SIGN_KEY

    const sign = createHash('md5')
      .update(signStr, 'utf8')
      .digest('hex')
      .toUpperCase()

    return {
      ...data,
      sign,
    }
  }

  // 将对象转换为 URL 编码字符串
  private static toUrlEncoded(data: Record<string, string>): string {
    return Object.entries(data)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
  }

  // 获取 TBS token
  private static async getTbs(bduss: string): Promise<string> {
    this.logger.group('获取TBS令牌')

    try {
      const response = await fetch(TBS_URL, {
        headers: {
          ...HEADERS,
          Cookie: `BDUSS=${bduss}`,
        },
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`获取失败: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      this.logger.info(`获取成功，TBS: ${data.tbs.slice(0, 8)}...`)
      this.logger.groupEnd('获取TBS令牌')
      return data.tbs
    }
    catch (error) {
      this.logger.error(`操作失败: ${error}`)
      this.logger.groupEnd('获取TBS令牌')

      // 重试机制
      this.logger.warn('开始重试获取TBS令牌')
      try {
        const response = await fetch(TBS_URL, {
          headers: {
            ...HEADERS,
            Cookie: `BDUSS=${bduss}`,
          },
          method: 'GET',
        })

        if (!response.ok) {
          throw new Error(`重试失败: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        this.logger.info(`重试成功，TBS: ${data.tbs.slice(0, 8)}...`)
        return data.tbs
      }
      catch (retryError) {
        this.logger.error(`重试失败: ${retryError}`)
        throw new Error('获取TBS令牌失败，已尝试两次')
      }
    }
  }

  // 获取关注的贴吧列表
  private static async getFavorite(bduss: string): Promise<Forum[]> {
    this.logger.group('获取关注的贴吧列表')
    const forums: Forum[] = []
    let pageNo = 1
    let hasMore = true
    let total = 0

    try {
      while (hasMore) {
        const data = this.encodeData({
          BDUSS: bduss,
          _client_id: 'wappc_1534235498291_488',
          from: '1008621y',
          page_no: pageNo.toString(),
          page_size: '200',
          timestamp: Math.floor(Date.now() / 1000).toString(),
          vcode_tag: '11',
          ...SIGN_DATA,
        })

        const response = await fetch(LIKE_URL, {
          headers: {
            ...HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          method: 'POST',
          body: this.toUrlEncoded(data),
        })

        if (!response.ok) {
          throw new Error(`获取失败: ${response.status} ${response.statusText}`)
        }

        const resData = await response.json()
        const nonGconforum = resData.forum_list['non-gconforum'] || []
        const gconforum = resData.forum_list.gconforum || []

        // 扁平化处理嵌套数组
        const pageForums = [...nonGconforum, ...gconforum].flat(Infinity).filter((f: any) => f.id && f.name).map((f: any) => ({ id: f.id, name: f.name }))

        forums.push(...pageForums)
        total += pageForums.length
        hasMore = resData.has_more === '1'
        pageNo++

        this.logger.debug(`第 ${pageNo - 1} 页，获取 ${pageForums.length} 个贴吧`)
      }

      this.logger.info(`成功获取 ${total} 个贴吧`)
      this.logger.groupEnd('获取关注的贴吧列表')
      return forums
    }
    catch (error) {
      this.logger.error(`获取失败: ${error}`)
      this.logger.groupEnd('获取关注的贴吧列表')
      return []
    }
  }

  // 客户端签到
  private static async clientSign(bduss: string, tbs: string, fid: string, kw: string): Promise<SignResult> {
    try {
      const data = this.encodeData({
        ...SIGN_DATA,
        BDUSS: bduss,
        fid,
        kw,
        tbs,
        timestamp: Math.floor(Date.now() / 1000).toString(),
      })

      const response = await fetch(SIGN_URL, {
        headers: {
          ...HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        body: this.toUrlEncoded(data),
      })

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    }
    catch (error) {
      this.logger.error(`签到异常: ${error}`)
      return { error_code: '99999', error_msg: '签到请求异常' }
    }
  }

  // 随机延时
  private static async randomDelay(min: number = 1000, max: number = 4000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min)) + min
    this.logger.debug(`等待 ${delay}ms 后继续`)
    await setTimeout(delay)
  }

  // 执行单个用户的签到流程
  public static async signForUser(bduss: string): Promise<void> {
    this.logger.group(`用户签到流程`)

    try {
      const tbs = await this.getTbs(bduss)
      const favorites = await this.getFavorite(bduss)

      if (favorites.length === 0) {
        this.logger.warn('未获取到关注的贴吧')
        this.logger.groupEnd(`用户签到流程`)
        return
      }

      this.logger.info(`开始签到 ${favorites.length} 个贴吧`)

      for (let i = 0; i < favorites.length; i++) {
        const forum = favorites[i]
        await this.randomDelay()
        const result = await this.clientSign(bduss, tbs, forum.id, forum.name)
        this.logger.signResult(forum.name, i + 1, favorites.length, result)
      }

      this.logger.info('所有贴吧签到完成')
      this.logger.groupEnd(`用户签到流程`)
    }
    catch (error) {
      this.logger.error(`用户签到失败: ${error}`)
      this.logger.groupEnd(`用户签到流程`)
      throw error
    }
  }

  // 执行所有用户的签到
  public static async signAllUsers(): Promise<void> {
    this.logger.group('批量签到任务')

    const bdussList = process.env.BDUSS?.split('#') || []

    if (bdussList.length === 0) {
      this.logger.error('未配置 BDUSS 环境变量')
      this.logger.groupEnd('批量签到任务')
      throw new Error('BDUSS not configured')
    }

    this.logger.info(`发现 ${bdussList.length} 个用户`)

    for (let i = 0; i < bdussList.length; i++) {
      const bduss = bdussList[i]
      this.logger.group(`处理用户 #${i + 1}/${bdussList.length}`)
      this.logger.info(`用户 #${i + 1} BDUSS: ${bduss.slice(0, 8)}...`)

      try {
        await this.signForUser(bduss)
      }
      catch (error) {
        this.logger.error(`用户 #${i + 1} 签到异常: ${error}`)
      }

      this.logger.groupEnd(`处理用户 #${i + 1}/${bdussList.length}`)
    }

    this.logger.info('所有用户签到任务完成')
    this.logger.groupEnd('批量签到任务')
  }
}

// 执行主函数
async function main() {
  try {
    await TiebaAutoSign.signAllUsers()
  }
  catch (error) {
    console.error(`\x1B[31m[程序错误] ${error}\x1B[0m`)
    process.exit(1)
  }
}

main()
