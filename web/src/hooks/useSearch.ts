/**
 * Хук семантического поиска: POST /v1/search. Мутация, а не query — поиск
 * запускается по действию пользователя (кнопка/submit), а не автоматически.
 */

import { useMutation } from '@tanstack/react-query'
import { searchItems } from '../api/client'
import type { SearchRequest } from '../types/api'

export function useSearch() {
  return useMutation({
    mutationFn: (payload: SearchRequest) => searchItems(payload),
  })
}
