import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import appIcon from '../../build/icon.png?asset'
import { startDesktop } from './bootstrap/desktop-app'

startDesktop(dirname(fileURLToPath(import.meta.url)), appIcon)
