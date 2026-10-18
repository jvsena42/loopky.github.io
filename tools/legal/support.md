# Loopky support

**Last updated:** 6 October 2026

Loopky is a free, open-source project with no support desk. **Help happens in the project's public
issue tracker:
[github.com/jvsena42/loopky/issues](https://github.com/jvsena42/loopky/issues).** Open an issue
there to report a bug or to ask a question.

## What to put in an issue

- the app version (shown in Settings) or the output of `loopky --version`;
- your device and its Android or iOS version;
- what you did, what you expected, and what happened instead.

**Issues are public.** Never include your recovery phrase, a recovery file, or a `pubkyauth://`
sign-in link: each of them is a way into your account.

## Before you open one

The [FAQ](https://loopky.app/faq/) answers the common questions: price, where Loopky runs, what an
Anki import brings across, how cards are scheduled, signing in and privacy. The problems below are
the ones people meet most.

- **Loopky asks you to sign in again, or a change will not save.** Sessions are time limited and
  can expire after about an hour. Reading keeps working, writing does not. Sign in again and repeat
  the change.
- **Storage is full.** The default homeserver gives each account 1 GB. Once it is full, writes are
  refused until you delete a deck or some images. Pictures imported from an Anki deck count against
  it; a picture added by web address does not.
- **An Anki deck will not import.** Loopky reads `.apkg` files holding `collection.anki2` or
  `.anki21`. For the newer `.anki21b`, export again from Anki with "Support older Anki versions"
  ticked. Audio, LaTeX and review history are not imported.
- **You lost your key or recovery phrase.** Nobody can recover it for you, the project included. Set
  up a backup in Settings before you need one.

## The command line tool, the connector and AI agents

`loopky doctor` is the first thing to run when the command line tool cannot reach the network,
which is the usual case in a cloud sandbox. It needs no sign-in, asks every host Loopky needs
through your proxy, and prints the ones to add to the allowlist. `loopky doctor --json` gives an
agent the same answer with a `next_step` to follow.

- Exit code 4 (`session_expired`): run `loopky login` again and approve it, then repeat what failed.
- Exit code 14 (`proxy_refused`) or 15 (`tls_untrusted`): the sandbox's network is blocking Loopky.
  Retrying will not help; follow what `loopky doctor` reports.

**The connector for Claude** (`https://mcp.loopky.app/mcp`) needs no install and no allowlist,
which makes it the simpler route in a cloud sandbox. If Claude says the connector has to be
reconnected, disconnect and add it again under Settings → Connectors and approve the sign-in in
Pubky Ring. Nothing else fixes that, and your decks are not affected. To stop it acting for you,
revoke `mcp.loopky.app` in Pubky Ring.

The [command line documentation](https://github.com/jvsena42/loopky/tree/main/cli) covers
installing, every command and every exit code, and `loopky commands --json` lists what your
installed version supports.

## What the project cannot help with

The only data the Loopky project holds is what the connector for Claude keeps while you are
connected, and none of it is your decks. So it cannot restore a deck, reset an account or lift a
storage limit. Those belong to the operator of your Pubky homeserver, which is
Synonym, through [pubky.app](https://pubky.app), if you signed up in Loopky. Questions about the
Pubky Ring app go to Pubky as well.

## Privacy and terms

The [privacy policy](https://loopky.app/privacy/) says what leaves your device and who receives it.
The [terms of service](https://loopky.app/terms/) say what you can expect from the project and what
you are responsible for when you publish.
