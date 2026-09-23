/**
 * Who is signed in. Email + magic URL: no passwords to leak, and a player at
 * the table only ever needs their inbox.
 */

import { ID } from 'appwrite';
import type { Models } from 'appwrite';

import { account } from './appwrite';

class Session {
  user = $state<Models.User<Models.Preferences> | null>(null);
  ready = $state(false);

  async load() {
    try {
      this.user = await account.get();
    } catch {
      this.user = null;
    }
    this.ready = true;
  }

  async sendLink(email: string) {
    const url = new URL('/auth/callback', window.location.origin).toString();
    await account.createMagicURLToken({ userId: ID.unique(), email, url });
  }

  async complete(userId: string, secret: string) {
    await account.createSession({ userId, secret });
    await this.load();
  }

  async rename(name: string) {
    this.user = await account.updateName({ name });
  }

  async signOut() {
    await account.deleteSession({ sessionId: 'current' });
    this.user = null;
  }
}

export const session = new Session();
