import axios from 'axios'

const PROD_API_URL = 'https://watchparty-youtube.onrender.com'
const API_URL = import.meta.env.VITE_API_URL || PROD_API_URL

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

export const createRoom = async (name, username) => {
  const { data } = await api.post('/api/rooms/', { name, username })
  return data
}

export const getRoomById = async (roomId) => {
  const { data } = await api.get(`/api/rooms/${roomId}`)
  return data
}

export const getRoomByCode = async (code) => {
  const { data } = await api.get(`/api/rooms/code/${code}`)
  return data
}

export const extractYouTubeId = (input) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const pattern of patterns) {
    const match = input.match(pattern)
    if (match) return match[1]
  }
  return null
}
