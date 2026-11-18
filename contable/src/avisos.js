import { createContext, useContext } from 'react'

export const AvisosCtx = createContext(() => {})
export const useAviso = () => useContext(AvisosCtx)
