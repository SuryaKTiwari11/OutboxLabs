// ─────────────────────────────────────────────────────────────
//  config/passport.ts
//  Google OAuth strategy using Passport.js.
//  Session: false — we use JWT cookies instead of sessions.
// ─────────────────────────────────────────────────────────────

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env } from "./env";
import { userRepository } from "../repositories/userRepository";
import { logger } from "../utils/logger";

export function configurePassport(): void {
  passport.use(
    new GoogleStrategy(
      {
        clientID:     env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL:  env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email found in Google profile"));
          }

          const user = await userRepository.upsertFromGoogle({
            googleId:  profile.id,
            email,
            name:      profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
          });

          logger.info(`[Passport] User authenticated`, { userId: user.id, email });
          return done(null, user);
        } catch (err) {
          logger.error(`[Passport] Google OAuth error`, { error: err });
          return done(err as Error);
        }
      }
    )
  );

  // No session serialization — we use JWTs
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user as Express.User));
}

