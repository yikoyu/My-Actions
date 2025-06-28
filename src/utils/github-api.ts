import process from 'node:process'
import sodium from 'libsodium-wrappers'

/** GitHub API Secret 管理工具 */
export class GitHubAPI {
  private static readonly BASE_URL = 'https://api.github.com'

  /** 生成请求头 */
  private static getHeaders(token: string): Record<string, string> {
    return {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  /** 从环境变量获取并生成仓库 URL */
  private static getRepoUrl(): string {
    const repoEnv = process.env.GITHUB_REPOSITORY
    if (!repoEnv) {
      console.error('🛑 未找到 GITHUB_REPOSITORY 环境变量')
      process.exit(1)
    }

    console.log(`ℹ️ 当前仓库: ${repoEnv}`)
    return `${this.BASE_URL}/repos/${repoEnv}`
  }

  /** 使用 libsodium-wrappers 加密 Secret 值 */
  private static async encryptSecret(publicKey: string, secretValue: string): Promise<string> {
    // 确保 libsodium 已初始化
    await sodium.ready

    // 清理公钥（移除 PEM 头/尾和换行符）
    const cleanKey = publicKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '')

    // 将 Base64 公钥转换为 Uint8Array
    const keyUint8Array = sodium.from_base64(cleanKey, sodium.base64_variants.ORIGINAL)
    // 将 Secret 值转换为 Uint8Array
    const secretUint8Array = sodium.from_string(secretValue)
    // 使用 libsodium 进行加密
    const encryptedBytes = sodium.crypto_box_seal(secretUint8Array, keyUint8Array)
    // 将加密结果转换为 Base64 字符串
    return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL)
  }

  /** 获取仓库的公共密钥 */
  private static async fetchPublicKey(
    token: string,
    repoUrl: string,
  ): Promise<{ key_id: string, key: string }> {
    const response = await fetch(
      `${repoUrl}/actions/secrets/public-key`,
      { headers: this.getHeaders(token) },
    )

    this.checkResponseStatus(response, '获取公共密钥')
    return response.json() as Promise<{ key_id: string, key: string }>
  }

  /** 检查响应状态 */
  private static checkResponseStatus(
    response: Response,
    action: string,
    successCodes: number[] = [200],
  ): void {
    if (!successCodes.includes(response.status)) {
      throw new Error(`${action}失败: ${response.status} ${response.statusText}`)
    }
  }

  /** 创建或更新仓库 Secret */
  static async createOrUpdateSecret(
    token: string,
    secretName: string,
    secretValue: string,
  ): Promise<void> {
    if (!token) {
      console.error('🛑 createOrUpdateSecret 方法缺少 token 参数')
      process.exit(1)
    }

    const repoUrl = this.getRepoUrl()
    const { key_id, key } = await this.fetchPublicKey(token, repoUrl)
    const encryptedValue = await this.encryptSecret(key, secretValue)

    const response = await fetch(
      `${repoUrl}/actions/secrets/${secretName}`,
      {
        method: 'PUT',
        headers: this.getHeaders(token),
        body: JSON.stringify({ encrypted_value: encryptedValue, key_id }),
      },
    )

    this.checkResponseStatus(response, '更新 Secret', [201, 204])
  }

  /** 删除仓库 Secret */
  static async deleteSecret(
    token: string,
    secretName: string,
  ): Promise<void> {
    if (!token) {
      console.error('🛑 deleteSecret 方法缺少 token 参数')
      process.exit(1)
    }

    const repoUrl = this.getRepoUrl()
    const response = await fetch(
      `${repoUrl}/actions/secrets/${secretName}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(token),
      },
    )

    this.checkResponseStatus(response, '删除 Secret')
  }
}
