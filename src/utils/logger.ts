/**
 * 优化后的日志系统 - 静态类实现
 */
export class Logger {
  // 日志级别颜色映射
  private static readonly _LEVEL_COLORS: Record<string, string> = {
    INFO: '\x1B[32m', // 绿色
    ERROR: '\x1B[31m', // 红色
    WARN: '\x1B[33m', // 黄色
    DEBUG: '\x1B[36m', // 青色
  }

  // 日志名称
  private static _loggerName: string = 'default'

  /**
   * 初始化日志器
   * @param name 日志器名称
   */
  public static init(name: string) {
    this._loggerName = name
  }

  /**
   * 格式化时间戳
   */
  private static _formatTime(): string {
    return new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  /**
   * 字符串填充到指定长度
   */
  private static _padString(str: string, length: number): string {
    return str.padEnd(length, ' ')
  }

  /**
   * 核心日志输出方法
   */
  private static _log(level: string, message: string, prefix = '') {
    const time = this._formatTime()
    const levelColor = this._LEVEL_COLORS[level] || '\x1B[0m'
    const resetColor = '\x1B[0m'

    console.log(`${levelColor}[${time}] [${this._padString(level, 5)}] [${this._loggerName}]${prefix} ${message}${resetColor}`)
  }

  /**
   * 信息日志
   */
  public static info(message: string) {
    this._log('INFO', message)
  }

  /**
   * 错误日志
   */
  public static error(message: string) {
    this._log('ERROR', message)
  }

  /**
   * 警告日志
   */
  public static warn(message: string) {
    this._log('WARN', message)
  }

  /**
   * 调试日志
   */
  public static debug(message: string) {
    this._log('DEBUG', message)
  }

  /**
   * 开始日志分组
   */
  public static group(title: string, index?: number, total?: number) {
    const indexStr = index !== undefined && total !== undefined ? ` (${index}/${total})` : ''
    this._log('INFO', title + indexStr)
  }

  /**
   * 结束日志分组
   */
  public static groupEnd(title: string) {
    this._log('INFO', title)
    console.log() // 添加空行分隔
  }
}
