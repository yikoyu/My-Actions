import { createHash } from 'node:crypto'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { DingtalkRobot } from './utils/dingtalk-robot'
import { Logger } from './utils/logger' // 引入新的日志系统

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

/** 签到结果接口 */
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

/**
 * 签到统计接口
 */
interface UserSignStats {
  /** 用户标识（BDUSS前8位） */
  userId: string
  /** 总贴吧数 */
  totalForums: number
  /** 成功签到数（包含已签到） */
  successfulSigns: number
  /** 失败签到数 */
  failedSigns: number
  /** 失败的贴吧名称列表 */
  failedForums: string[]
}

export class TiebaAutoSign {
  // 初始化日志器
  static {
    Logger.init('tieba')
  }

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
    Logger.group('获取TBS令牌')

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
      Logger.info(`获取成功，TBS: ${data.tbs.slice(0, 8)}...`)
      Logger.groupEnd('获取TBS令牌')
      return data.tbs
    }
    catch (error) {
      Logger.error(`操作失败: ${error}`)
      Logger.groupEnd('获取TBS令牌')

      // 重试机制
      Logger.warn('开始重试获取TBS令牌')
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
        Logger.info(`重试成功，TBS: ${data.tbs.slice(0, 8)}...`)
        return data.tbs
      }
      catch (retryError) {
        Logger.error(`重试失败: ${retryError}`)
        throw new Error('获取TBS令牌失败，已尝试两次')
      }
    }
  }

  // 获取关注的贴吧列表
  private static async getFavorite(bduss: string): Promise<Forum[]> {
    Logger.group('获取关注的贴吧列表')
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

        Logger.debug(`第 ${pageNo - 1} 页，获取 ${pageForums.length} 个贴吧`)
      }

      Logger.info(`成功获取 ${total} 个贴吧`)
      Logger.groupEnd('获取关注的贴吧列表')
      return forums
    }
    catch (error) {
      Logger.error(`获取失败: ${error}`)
      Logger.groupEnd('获取关注的贴吧列表')
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
      Logger.error(`签到异常: ${error}`)
      return { error_code: '99999', error_msg: '签到请求异常' }
    }
  }

  // 随机延时
  private static async randomDelay(min: number = 500, max: number = 2000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min)) + min
    Logger.debug(`等待 ${delay}ms 后继续`)
    await setTimeout(delay)
  }

  // 格式化输出签到结果
  private static formatSignResult(forumName: string, index: number, total: number, result: SignResult): void {
    const code = result.error_code || '200'
    // 新增已签到状态判断（error_code=160002）
    const status = code === '0'
      ? '成功'
      : (code === '160002' ? '已签到' : '失败')
    const color = code === '0' || code === '160002'
      ? '\x1B[32m'
      : '\x1B[31m'
    const reset = '\x1B[0m'

    Logger.info(`签到 "${forumName}" 贴吧 (${index}/${total}) ${color}[${status}]${reset}`)
    Logger.debug(`  结果码: ${code}`)
    Logger.debug(`  提示信息: ${result.error_msg || '无'}`)

    // 处理签到成功的详细信息
    if (code === '0' && result.user_info) {
      const userInfo = result.user_info
      Logger.info('  用户签到详情:')
      Logger.info(`    签到排名: ${userInfo.user_sign_rank}`)
      Logger.info(`    连续签到: ${userInfo.cont_sign_num} 天`)
      Logger.info(`    总签到数: ${userInfo.total_sign_num} 次`)
      Logger.info(`    本次获得经验: ${userInfo.sign_bonus_point}`)
      Logger.info(`    当前等级: ${userInfo.level_name} (${userInfo.levelup_score}经验升级)`)
    }

    console.log()
  }

  // 执行单个用户的签到流程，返回统计信息
  public static async signForUser(bduss: string): Promise<UserSignStats> {
    Logger.group(`用户签到流程`)
    const userId = bduss.slice(0, 8)
    const stats: UserSignStats = {
      userId,
      totalForums: 0,
      successfulSigns: 0,
      failedSigns: 0,
      failedForums: [],
    }

    try {
      const tbs = await this.getTbs(bduss)
      const favorites = await this.getFavorite(bduss)
      stats.totalForums = favorites.length

      if (favorites.length === 0) {
        Logger.warn('未获取到关注的贴吧')
        Logger.groupEnd(`用户签到流程`)
        return stats
      }

      Logger.info(`开始签到 ${favorites.length} 个贴吧`)

      for (let i = 0; i < favorites.length; i++) {
        const forum = favorites[i]
        await this.randomDelay()
        const result = await this.clientSign(bduss, tbs, forum.id, forum.name)
        const code = result.error_code || '200'

        // 更新统计信息，区分已签到和真正失败
        if (code === '0' || code === '160002') {
          stats.successfulSigns++ // 已签到也计入成功
        }
        else {
          stats.failedSigns++
          stats.failedForums.push(forum.name)
        }

        // 使用封装的方法格式化输出签到结果
        this.formatSignResult(forum.name, i + 1, favorites.length, result)
      }

      Logger.info('所有贴吧签到完成')
      Logger.groupEnd(`用户签到流程`)
      return stats
    }
    catch (error) {
      Logger.error(`用户签到失败: ${error}`)
      Logger.groupEnd(`用户签到流程`)
      // 标记所有签到为失败
      stats.failedSigns = stats.totalForums
      stats.failedForums = ['签到过程中发生异常']
      return stats
    }
  }

  // 执行所有用户的签到并收集统计信息
  public static async signAllUsers(): Promise<UserSignStats[]> {
    Logger.group('批量签到任务')

    const bdussList = process.env.BDUSS?.split('#').filter(k => k) || []
    const allStats: UserSignStats[] = []

    if (bdussList.length === 0) {
      Logger.error('未配置 BDUSS 环境变量')
      Logger.groupEnd('批量签到任务')
      throw new Error('BDUSS not configured')
    }

    Logger.info(`发现 ${bdussList.length} 个用户`)

    for (let i = 0; i < bdussList.length; i++) {
      const bduss = bdussList[i]
      Logger.group(`处理用户 #${i + 1}/${bdussList.length}`)
      Logger.info(`用户 #${i + 1} BDUSS: ${bduss.slice(0, 8)}...`)

      try {
        const stats = await this.signForUser(bduss)
        allStats.push(stats)
      }
      catch (error) {
        Logger.error(`用户 #${i + 1} 签到异常: ${error}`)
        // 添加异常统计
        allStats.push({
          userId: bduss.slice(0, 8),
          totalForums: 0,
          successfulSigns: 0,
          failedSigns: 0,
          failedForums: ['签到过程中发生异常'],
        })
      }

      Logger.groupEnd(`处理用户 #${i + 1}/${bdussList.length}`)
    }

    Logger.info('所有用户签到任务完成')
    Logger.groupEnd('批量签到任务')
    return allStats
  }

  // 生成签到总结Markdown内容
  static generateSummary(statsList: UserSignStats[]): string {
    let summary = '### 贴吧签到总结\n\n'
    summary += '#### 今日签到统计\n\n'

    statsList.forEach((stats, index) => {
      summary += `**用户 ${index + 1} (${stats.userId})**\n`
      summary += `- 总贴吧数: ${stats.totalForums}\n`
      summary += `- 成功/已签到: ${stats.successfulSigns}\n`
      summary += `- 失败数: ${stats.failedSigns}\n`

      if (stats.failedSigns > 0) {
        summary += `- 失败贴吧: ${stats.failedForums.join('、')}\n`
      }

      summary += '\n'
    })

    // 计算全局统计
    const totalForums = statsList.reduce((sum, stats) => sum + stats.totalForums, 0)
    const totalSuccess = statsList.reduce((sum, stats) => sum + stats.successfulSigns, 0)
    const totalFailed = statsList.reduce((sum, stats) => sum + stats.failedSigns, 0)

    summary += '#### 全局统计\n'
    summary += `- 总用户数: ${statsList.length}\n`
    summary += `- 总贴吧数: ${totalForums}\n`
    summary += `- 成功/已签到数: ${totalSuccess}\n`
    summary += `- 失败数: ${totalFailed}\n`
    summary += `- 成功率: ${totalForums > 0 ? ((totalSuccess / totalForums) * 100).toFixed(2) : 0}%\n`

    return summary
  }

  // 发送总结到钉钉
  public static async sendSummaryToDingTalk(summary: string): Promise<void> {
    try {
      const result = await DingtalkRobot.sendMarkdown('[签到提醒] 贴吧签到', summary)
      if (result === null) {
        return
      }
      Logger.info('签到总结已发送至钉钉')
    }
    catch (error) {
      Logger.error(`发送钉钉总结失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

// 执行主函数
async function main() {
  try {
    const statsList = await TiebaAutoSign.signAllUsers()
    const summary = TiebaAutoSign.generateSummary(statsList)

    // 输出总结到控制台
    console.log(`\n${summary}`)

    // 发送总结到钉钉
    await TiebaAutoSign.sendSummaryToDingTalk(summary)
  }
  catch (error) {
    console.error(`\x1B[31m[程序错误] ${error}\x1B[0m`)

    // 即使程序出错，也尝试发送错误总结
    try {
      await TiebaAutoSign.sendSummaryToDingTalk(`### 贴吧签到异常\n\n[程序错误] ${error}`)
    }
    catch (sendError) {
      console.error(`发送错误通知失败: ${sendError}`)
    }

    process.exit(1)
  }
}

main()
