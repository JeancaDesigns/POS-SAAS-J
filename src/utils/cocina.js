import { useAuthStore } from '../store/authStore'

// ¿El restaurante pasa los pedidos por cocina? (módulo 'cocina' activo)
// Sin cocina (p. ej. un bar que prepara en la barra): el pedido enviado ya se puede cobrar,
// las líneas quedan como "Pedido" y el inventario se descuenta al cobrar.
export function usaCocina() {
  const { modules } = useAuthStore.getState()
  return !modules?.length || modules.includes('cocina')
}
