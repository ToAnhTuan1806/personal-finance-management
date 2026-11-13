export function getRobotState({ loading = false, error = '', messages = [] } = {}) {
  if (loading) return 'LOADING'
  if (error) return 'ERROR'
  return messages.at(-1)?.role === 'assistant' ? 'SUCCESS' : 'IDLE'
}
