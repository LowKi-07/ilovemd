#!/bin/bash
# Double-click this to get the prompt bar working.
#
# It finds the Claude Code CLI, tests whether it can actually answer a prompt,
# and if it cannot, says exactly why and hands you straight to the sign-in. The
# whole point is that you never have to remember a command: the one thing that
# has repeatedly gone wrong is `claude --version` succeeding while `claude -p`
# fails, and that is invisible unless something actually sends a prompt.

set -u
cd "$(dirname "$0")" || exit 1

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; OFF=$'\033[0m'

line() { printf '%s\n' "------------------------------------------------------------"; }
say()  { printf '%s\n' "$*"; }

say ""
say "${BOLD}2md - prompt bar check${OFF}"
line

# ---------------------------------------------------------------- find the CLI
CLI=""
if command -v claude >/dev/null 2>&1; then
  CLI="$(command -v claude)"
else
  # A GUI-launched shell does not always have the same PATH, and the installer
  # puts the binary in different places. Look where it actually lands.
  for c in "$HOME/.claude/local/claude" "$HOME/.local/bin/claude" \
           "$HOME/.bun/bin/claude" "$HOME/.npm-global/bin/claude" \
           /opt/homebrew/bin/claude /usr/local/bin/claude /usr/bin/claude; do
    [ -x "$c" ] && { CLI="$c"; break; }
  done
fi

if [ -z "$CLI" ]; then
  say "${RED}Claude Code is not installed on this Mac.${OFF}"
  say ""
  say "The prompt bar needs it. Install it, then run this again:"
  say "  ${BOLD}https://docs.claude.com/en/docs/claude-code${OFF}"
  say ""
  say "Everything else in 2md works without it - writing, editing and"
  say "saving never touch Claude."
  say ""
  read -r -p "Press Return to close."
  exit 1
fi

say "Found the CLI at ${BOLD}${CLI}${OFF}"
say "Version: $("$CLI" --version 2>&1 | head -1)"
say ""

# ------------------------------------------------------------------ real test
# --version succeeds even when signed out, so it proves nothing. Send a prompt.
probe() {
  "$CLI" -p 'Reply with exactly: OK' </dev/null 2>&1 | head -5
}

say "Sending a test prompt (this is the check that matters)..."
OUT="$(probe)"
say "${DIM}${OUT}${OFF}"
say ""

if printf '%s' "$OUT" | grep -q 'OK'; then
  say "${GRN}${BOLD}Working.${OFF} The prompt bar will work."
  say ""
  read -r -p "Start 2md now? [Y/n] " GO
  case "${GO:-Y}" in
    [Nn]*) say "Fine - double-click ${BOLD}2md${OFF} whenever you are ready." ;;
    *) exec ./2md.command ;;
  esac
  exit 0
fi

# --------------------------------------------------------------- diagnose it
line
if printf '%s' "$OUT" | grep -qiE 'revoked'; then
  say "${YEL}${BOLD}The CLI's saved sign-in has been REVOKED.${OFF}"
  say ""
  say "Not expired - something actively withdrew it. Usually signing in"
  say "elsewhere, or an admin rotating access. Signing in again normally fixes"
  say "it; if your organisation revoked it deliberately, it may refuse, and"
  say "that is a question for IT rather than something to retry."
  NEEDS_LOGIN=1
elif printf '%s' "$OUT" | grep -qiE 'not logged in|/login|authenticat|401|403|unauthor'; then
  say "${YEL}${BOLD}The CLI is not signed in.${OFF}"
  NEEDS_LOGIN=1
elif printf '%s' "$OUT" | grep -qiE 'rate limit|usage limit|quota|credit|billing'; then
  say "${YEL}${BOLD}The Claude account has hit a usage or billing limit.${OFF}"
  say "Nothing to fix here - it needs more quota, or waiting."
  NEEDS_LOGIN=0
else
  say "${YEL}${BOLD}The CLI ran but did not answer.${OFF}"
  say "The output above is what it said. Paste it to Claude in Cowork."
  NEEDS_LOGIN=0
fi
say ""

if [ "${NEEDS_LOGIN:-0}" = "1" ]; then
  say "${BOLD}The fix:${OFF} sign in inside a Claude Code session."
  say ""
  say "  ${DIM}Note: \`claude /login\` does NOT work from the shell.${OFF}"
  say "  ${DIM}/login only exists inside a running session.${OFF}"
  say ""
  say "This script can open one for you. When it appears:"
  say "  1. type  ${BOLD}/login${OFF}  and press Return"
  say "  2. finish the sign-in in the browser window that opens"
  say "  3. quit the session with  ${BOLD}Ctrl+C${OFF}  (twice if needed)"
  say ""
  read -r -p "Open a Claude Code session now? [Y/n] " GO
  case "${GO:-Y}" in
    [Nn]*)
      say ""
      say "No problem. Run this script again once you have signed in."
      say ""
      read -r -p "Press Return to close."
      exit 1
      ;;
  esac

  say ""
  line
  "$CLI" || true
  line
  say ""
  say "Re-testing..."
  OUT2="$(probe)"
  say "${DIM}${OUT2}${OFF}"
  say ""
  if printf '%s' "$OUT2" | grep -q 'OK'; then
    say "${GRN}${BOLD}Signed in and working.${OFF}"
    say ""
    read -r -p "Start 2md now? [Y/n] " GO2
    case "${GO2:-Y}" in
      [Nn]*) say "Double-click ${BOLD}2md${OFF} when ready." ;;
      *) exec ./2md.command ;;
    esac
    exit 0
  fi
  say "${RED}Still not working.${OFF}"
  say "The output above is the real reason. If it still mentions revoked or"
  say "unauthorised, your organisation is blocking the CLI sign-in - take that"
  say "to IT. Meanwhile 2md still works for writing, editing and saving."
fi

say ""
read -r -p "Press Return to close."
