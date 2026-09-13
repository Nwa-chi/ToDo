export function authErrorMessage(error) {
  const message=error?.message||'',code=error?.code||'';
  if(/sending.*(confirmation|recovery|email)/i.test(message))return 'We couldn’t send your email code. The email service needs attention. Please try again later; changing your password here will not fix this.';
  if(code==='email_not_confirmed')return 'Verify your email first. Enter your code below, or request a new one.';
  if(code==='invalid_credentials'||/invalid login credentials/i.test(message))return 'The email or password was not recognised. Check your details, or use Forgot password.';
  if(code==='over_email_send_rate_limit'||error?.status===429)return 'Too many requests. Please wait a few minutes before trying again.';
  if(code==='otp_expired')return 'That code is invalid or has expired. Request a new code and try again.';
  if(/fetch|network/i.test(message))return 'We couldn’t connect. Check your internet connection and try again.';
  return message||'Unable to complete this request. Please try again.';
}
