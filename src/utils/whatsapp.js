export function buildWhatsappLink(phone, message) {
  if (!phone) return null
  const cleanPhone = phone.replace(/\D/g, '')
  const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`
}

export function getEstimatedTime(pendingCount) {
  if (pendingCount <= 5) return 15
  if (pendingCount <= 10) return 25
  if (pendingCount <= 19) return 40
  return 60
}