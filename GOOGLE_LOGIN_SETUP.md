# Google 登录设置指南

## 1. 获取 Google OAuth 凭据

### 步骤 1: 访问 Google Cloud Console
1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 登录你的 Google 账号

### 步骤 2: 创建项目（如果还没有）
1. 点击顶部的项目下拉菜单
2. 点击 "新建项目"
3. 输入项目名称（例如："Oiyen Investment"）
4. 点击 "创建"

### 步骤 3: 启用 Google+ API
1. 在左侧菜单中，选择 "API 和服务" > "库"
2. 搜索 "Google+ API"
3. 点击并启用它

### 步骤 4: 创建 OAuth 2.0 凭据
1. 在左侧菜单中，选择 "API 和服务" > "凭据"
2. 点击 "+ 创建凭据" > "OAuth 客户端 ID"
3. 如果提示配置同意屏幕，先配置：
   - 用户类型：选择 "外部"
   - 填写必填字段（应用名称、用户支持电子邮件等）
   - 保存并继续
4. 返回创建 OAuth 客户端 ID：
   - 应用类型：选择 "Web 应用"
   - 名称：输入名称（例如："Oiyen Web Client"）
   - 已获授权的重定向 URI：添加：
     - `http://localhost:3000/api/auth/callback/google`
     - `https://oiyen.quadrawebs.com/api/auth/callback/google`
   - 点击 "创建"

### 步骤 5: 保存凭据
1. 复制 **客户端 ID** 和 **客户端密钥**
2. 将它们添加到你的 `.env.local` 文件中

## 2. 配置环境变量

创建 `.env.local` 文件：

```env
# Database
DATABASE_URL="your-database-url"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="run-this-command: openssl rand -base64 32"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id-here"
GOOGLE_CLIENT_SECRET="your-google-client-secret-here"

# Email (for forgot password)
EMAIL_USER="your-gmail@gmail.com"
EMAIL_PASS="your-gmail-app-password"

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 生成 NEXTAUTH_SECRET
在 PowerShell 中运行：
```powershell
# 方法 1: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 方法 2: 在线生成
# 访问 https://generate-secret.vercel.app/32
```

## 3. 更新登录页面

在你的登录页面添加 "使用 Google 登录" 按钮：

```tsx
import { signIn } from "next-auth/react";

// 在登录表单中添加：
<button
  onClick={() => signIn("google", { callbackUrl: "/investment" })}
  style={{ /* 你的样式 */ }}
>
  使用 Google 登录
</button>
```

## 4. 部署到生产环境

部署后，记得在 Google Cloud Console 中添加生产环境的回调 URL：
- `https://oiyen.quadrawebs.com/api/auth/callback/google`

并更新 `.env` 文件：
```env
NEXTAUTH_URL="https://oiyen.quadrawebs.com"
```

## 5. 测试

1. 启动开发服务器：`npm run dev`
2. 访问登录页面
3. 点击 "使用 Google 登录"
4. 应该会跳转到 Google 登录页面
5. 登录成功后会自动创建用户并跳转回你的网站

## 故障排除

### 错误: "redirect_uri_mismatch"
- 确保 Google Console 中的重定向 URI 与你的应用完全匹配
- 检查是否包含 `http://localhost:3000/api/auth/callback/google`

### 错误: "invalid_client"
- 检查 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET 是否正确
- 确保没有多余的空格或引号

### 用户登录后没有角色
- 在数据库中手动更新用户角色，或修改 NextAuth 回调函数自动分配角色
