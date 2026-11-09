import {randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64) as Buffer;return `${salt}:${key.toString('hex')}`}
export async function verifyPassword(password:string,stored:string){const [salt,hex]=stored.split(':');if(!salt||!hex)return false;const key=await scrypt(password,salt,64) as Buffer,expected=Buffer.from(hex,'hex');return expected.length===key.length&&timingSafeEqual(key,expected)}
