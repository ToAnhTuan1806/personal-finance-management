import axiosClient from '../api/axiosClient.js'
import { isValidDate } from '../utils/transactionForm.js'

const endpoint = '/savings-challenges'
const validReward = (reward) => typeof reward?.unlocked === 'boolean' && typeof reward.useGoldenPig === 'boolean'

function invalidResponse() {
  return Object.assign(new Error('Phản hồi máy chủ không hợp lệ.'), { code: 'INVALID_API_RESPONSE' })
}

export async function getSavingsOverview(options) {
  const { data } = await axiosClient.get(endpoint, options)
  if (!isValidDate(data?.today) || !Array.isArray(data.challenges) || !validReward(data.reward)) throw invalidResponse()
  return data
}

export async function getSavingsReward(options) {
  const { data } = await axiosClient.get(endpoint + '/reward', options)
  if (!validReward(data)) throw invalidResponse()
  return data
}

export async function startSavingsChallenge(payload) {
  const { data } = await axiosClient.post(endpoint, payload)
  return data
}

export async function submitSaving(challengeId, payload) {
  const { data } = await axiosClient.post(endpoint + '/' + encodeURIComponent(challengeId) + '/savings', payload)
  return data
}

export async function importSavingsChallenge(challenge) {
  const { data } = await axiosClient.post(endpoint + '/import', { ...challenge, level: challenge.level ?? 'medium' })
  return data
}

export async function setSavingsMascot(useGoldenPig) {
  const { data } = await axiosClient.put(endpoint + '/reward', { useGoldenPig })
  return data
}
