/**
 * Cookie 管理器
 * @class
 */
export class CookieManager {
  /**
   * 会话Cookie存储
   * @type {Record<string, string>}
   */
  static cookies: Record<string, string> = {}

  /**
   * 从响应头解析Cookie
   * @param {Response} response - fetch API的响应对象
   */
  static parseCookies(response: Response): void {
    const setCookieHeaders = response.headers.get('set-cookie')
    if (!setCookieHeaders)
      return

    setCookieHeaders.split(',').forEach((cookieStr: string) => {
      const cookieParts = cookieStr.split(';').map((part: string) => part.trim())
      const [name, value] = cookieParts[0].split('=')
      if (name && value) {
        this.cookies[name] = value
      }
    })
  }

  /**
   * 从字符串设置Cookie
   * @param {string} cookieString - 包含多个cookie的字符串
   */
  static setCookiesFromString(cookieString: string): void {
    if (!cookieString)
      return

    cookieString.split(';').forEach((cookiePart: string) => {
      const [name, value] = cookiePart.trim().split('=')
      if (name && value) {
        this.cookies[name] = value
      }
    })
  }

  /**
   * 生成请求头中的Cookie字符串
   * @returns {string} - 格式化的Cookie字符串
   */
  static getCookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }

  /**
   * 清除所有Cookie
   */
  static clear(): void {
    this.cookies = {}
  }
}
