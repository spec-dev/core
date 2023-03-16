import { ValidatedPayload, StringKeyMap } from '../../types'
import { isEmail } from '../../utils/validators'

export interface UserLoginPayload {
    email: string
    password: string
}

export function parseUserLoginPayload(data: StringKeyMap): ValidatedPayload<UserLoginPayload> {
    const email = data?.email
    const password = data?.password

    if (!email || !password) {
        return { isValid: false, error: 'Both email and password required' }
    }

    if (!isEmail(email)) {
        return { isValid: false, error: 'Invalid email address' }
    }

    return {
        isValid: true,
        payload: { email, password },
    }
}
