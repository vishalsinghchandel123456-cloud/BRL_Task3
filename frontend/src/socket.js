 
import { io } from 'socket.io-client';
import { API_URL, getToken } from './api.js';

export function connectSocket() {
  return io(API_URL, {
    auth: { token: getToken() },
    autoConnect: true,
    reconnection: true,
  });
}
