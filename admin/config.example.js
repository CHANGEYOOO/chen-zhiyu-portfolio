// Cloudflare Access 负责登录；这里不应包含 Supabase URL、匿名 Key 或其他密钥。
window.PORTFOLIO_ADMIN_CONFIG = {
  // 若管理员 API 通过同源反向代理提供，保持为空。
  apiBaseUrl: "",
  accessLoginUrl: "/admin/",
};
