# Complete Beginner's Guide

> English | [中文](009-beginner-guide.zh.md)

> This guide is for someone meeting DSH, Git and the command line for the first time. You do not need to know how to program; just follow it step by step.
>
> The current project is a **research prototype**, not production-grade software. Use a test repository first, and do not let it change important code right away.

---

## 1. Understand it in one sentence

**dsh-superagent is an "AI work assistant" that lives in the sidebar of DeepSeek Harness (DSH).**

You write one sentence in the panel, and it:

1. decides whether that sentence is a clear task;
2. if it can be done, creates a "task" (a Ticket);
3. executes it in a separate directory;
4. posts the result and an explanation back into the same conversation.

The whole flow needs neither GitHub nor Feishu. **The sidebar panel alone is enough to work.**

Think of it as a new colleague:

- you tell it what to do;
- it first works out what you mean;
- then it gets to work in a separate working copy;
- when it is done, it reports back to you.

---

## 2. Six words you need to know

| Word | In plain words |
| --- | --- |
| **DSH** | DeepSeek Harness, the host program that runs this assistant. The web page you have open now is the DSH interface. |
| **Superagent** | The name of the project's entry in the left sidebar of DSH. Click it to open this assistant's management panel. |
| **Panel** | Where you talk to the assistant, watch task status and read results. |
| **Trigger** | One message you send. It is recorded first, then goes into an "Eval". |
| **Eval** | The assistant first decides: whether this sentence should be done, whether it can be done, and whether it should be done now. |
| **Ticket** | The work that actually runs after an Eval accepts it. A Ticket has its own status, working directory and result. |

You do not need to memorise these English words. Just remember: **send a message → wait for the Eval → look at the Ticket → read the reply.**

---

## 3. The state of this machine

This machine already has a separate Superagent installed and running:

| Item | Current value |
| --- | --- |
| Panel port | `3082` |
| Test repository in use | `/home/administrator/dsh-superagent-smoke` |
| Ticket working directory | `/home/administrator/.dsh/state/superagent/work` |
| Runtime profile | `superagent` |
| Normal DSH page | `3080` (do not confuse it with 3082) |

That is:

- `3080` is the DSH you use day to day;
- `3082` is the standalone Superagent instance installed this time;
- the two instances do not affect each other.

The current test repository holds only one README; it is a throwaway repository made specifically for verification. **You can let the assistant read and write it freely.**

---

## 4. Opening the panel for the first time

### 4.1 Find the address with the token

The DSH panel needs a link that carries a `token` before it will open. That link works like a temporary key, **do not send it to anyone**.

If you still have the link given at install time, just open it; it looks like:

```text
http://127.0.0.1:3082/?token=a-string-of-characters
```

If the link is lost, run this in a terminal:

```sh
cd /home/administrator/dsh-superagent-prototype
grep -h 'dsh web:' "$(ls -t .artifacts/dsh-superagent-superagent-*.log | head -1)"
```

The output contains a line like:

```text
dsh web: http://127.0.0.1:3082/?token=...
```

Copy the whole address into your browser and open it.

> If the browser reports 401, unauthorized, or asks you to log in, it is usually because the token is missing or you used an old link.

### 4.2 Open the sidebar entry

After the page opens:

1. look at the left sidebar;
2. find **Superagent**;
3. click it.

You will see several tabs, commonly:

- **Overview**: what happened today, and whether anything needs you;
- **Sources**: where messages come from (panel, GitHub, Gitea, GitLab, Feishu and so on);
- **Trigger**: all conversations and messages;
- **Eval**: the assistant's records of how it judged messages;
- **Execution**: Tickets that are running or have already ended;
- **Settings**: model, policy, executor and other configuration.

For first use, you only need **Trigger** and **Execution**.

---

## 5. Sending your first message

### 5.1 Where to type

1. Click **Superagent** in the left sidebar;
2. click **Trigger** at the top;
3. find the input box that says "Describe what you want superagent to do…";
4. type one sentence;
5. click **Send**, or press `Ctrl + Enter` (`⌘ + Enter` on a Mac).

### 5.2 Write your first message like this

The first time, do not ask it to change files; give it a read-only task first:

```text
Please look at the current repository in read-only mode and introduce what it does in three sentences. Do not modify any file.
```

This sentence carries three important pieces of information:

- **read-only**: changing files is explicitly not allowed;
- **current repository**: the scope is clear;
- **three sentences**: the length of the result is clear.

### 5.3 What happens after you send it

You will usually see, in order:

1. **Received**: the message has become a Trigger;
2. **Evaluating**: the assistant is making its assessment;
3. **Accepted**: a Ticket has been created;
4. **Running**: the Ticket runs in the working directory;
5. **Ended**: there is a final reply.

Open this conversation in **Trigger** to see the full timeline; open **Execution** to see the Ticket details.

---

## 6. How to read the result

### 6.1 Read the reply in the conversation

After the Ticket ends, a reply appears in the conversation, usually covering:

- what it did;
- what it found;
- whether it changed any file;
- anything you should pay attention to.

### 6.2 Look at the Ticket status

Click **Execution** and find the Ticket. Common statuses:

| Status | Meaning |
| --- | --- |
| **Working** | It is working |
| **Awaiting answer** | It has a question that needs your answer |
| **Ended** | The work is done and the reply has been sent |
| **Failed** | Something went wrong; retry or investigate |
| **Stopped** | A person stopped it |

### 6.3 See what it changed

If the Ticket changed files, the working copy is at:

```text
/home/administrator/.dsh/state/superagent/work/<ticket-name>-<number>
```

You can ask the assistant to list the changes in its reply, or ask someone who knows Git to inspect this directory.

> Important: the current test repository is the smoke repository, not your real project. Before real use, switch to a copy of your project.

---

## 7. Following up on the same Ticket

Do not start a new conversation every time. The right way is:

1. open **Trigger**;
2. open the earlier conversation;
3. keep writing in the input box at the bottom of the conversation;
4. send.

The new message then enters the same context, and the assistant knows you are continuing the previous piece of work.

Good cases for continuing:

- "Shorten the explanation you just gave a little more."
- "Check again whether anything is missing."
- "Do not change any code for this plan yet; just explain the reasons."

---

## 8. How to ask so the result is better

### 8.1 Recommended template

```text
Please look at [which directory or file] [read-only / with changes],
complete [the specific goal],
do not do [what is explicitly forbidden],
and when you are done tell me [the result you want to see].
```

### 8.2 Three examples

Read-only check:

```text
Please check the README of the current repository in read-only mode and point out anything in it that could mislead a reader. Do not modify any file.
```

Small-scope change:

```text
Please change only README.md, and rewrite the first paragraph under the title so it reads better for a beginner. Do not change other files, and tell me which lines you changed when you are done.
```

Discuss first, act later:

```text
I want to add installation instructions to this repository, but do not modify any file yet. Please give me two options first, explain the pros and cons of each, and wait for me to choose.
```

### 8.3 Try to avoid

- asking for too many things at once;
- not stating the scope, for example "help me optimize the project";
- not saying whether changing files is allowed;
- pasting passwords, tokens or private keys into the conversation;
- doing your first experiment on a real repository.

---

## 9. Stopping, restarting and checking status

Run the following commands from the project directory:

```sh
cd /home/administrator/dsh-superagent-prototype
```

### 9.1 Check whether it is running

```sh
PATH=/tmp/dsh-bin:$PATH scripts/dsh-superagent status \
  --profile superagent --url http://127.0.0.1:3082
```

If you see:

```json
"health": { "runtime": "ready" }
```

and the command exits with code `0`, everything is normal.

### 9.2 Stop

```sh
PATH=/tmp/dsh-bin:$PATH scripts/dsh-superagent stop \
  --profile superagent --url http://127.0.0.1:3082
```

After stopping, the web page not opening is normal; automatic recovery also pauses until you start it again.

### 9.3 Start

```sh
PATH=/tmp/dsh-bin:$PATH scripts/dsh-superagent start \
  --profile superagent --url http://127.0.0.1:3082
```

After starting, wait for the ready message, then open the address with the token.

### 9.4 Restart

```sh
PATH=/tmp/dsh-bin:$PATH scripts/dsh-superagent restart \
  --profile superagent --url http://127.0.0.1:3082
```

> `/tmp/dsh-bin/dsh` is a temporary DSH launcher used on this machine. If it disappears after the machine restarts, starting will report that `dsh` cannot be found. In that case ask the maintainer to install DSH globally, or recreate this launcher.

---

## 10. Switching to your own repository

The current configuration points to the test repository:

```text
/home/administrator/dsh-superagent-smoke
```

To switch to your own repository, first confirm that it is already a Git repository:

```sh
cd /your/project/directory
git status
```

If it shows the branch and files normally, it is usable.

Then edit the Superagent configuration file:

```sh
cp ~/.dsh/profiles/superagent/cordis.patch.yml \
   ~/.dsh/profiles/superagent/cordis.patch.yml.bak

nano ~/.dsh/profiles/superagent/cordis.patch.yml
```

Find this line:

```yaml
localRepository: /home/administrator/dsh-superagent-smoke
```

Change it to the absolute path of your repository, for example:

```yaml
localRepository: /home/administrator/my-project
```

Save and exit:

- `Ctrl + O`
- Enter
- `Ctrl + X`

Then restart:

```sh
PATH=/tmp/dsh-bin:$PATH scripts/dsh-superagent restart \
  --profile superagent --url http://127.0.0.1:3082
```

Notes:

- the path must be an **absolute path**;
- try to **avoid spaces** in the path;
- do not configure a GitHub repository and `localRepository` at the same time; you can only choose one of the two;
- for a first connection to a real project, copy it first; do not point at your most important repository directly.

---

## 11. Frequently asked questions

### Q1: The page does not open

First check whether the service is running:

```sh
PATH=/tmp/dsh-bin:$PATH scripts/dsh-superagent status \
  --profile superagent --url http://127.0.0.1:3082
```

- if `pids` is empty: the service is not started, run `start`;
- if it shows 401: the address has no token, get it again as described in section 4.1;
- if the connection is refused: wrong port, confirm it is `3082`;
- if the status reports an error: read the newest log under `.artifacts/`.

### Q2: There is no Superagent in the sidebar

That means the browser loaded the wrong profile, or the bundle is not installed properly. Confirm that you opened `3082`, not `3080`.

### Q3: The message was sent, but there is never a reply

Check in order:

1. whether **Overview** shows a "problem";
2. what status the Ticket has in **Execution**;
3. whether it is stuck at "Awaiting answer" (it may have asked you a question);
4. whether the service is still ready;
5. whether the model network or quota has a problem.

### Q4: It changed the wrong files

Do not keep sending messages for now. Open **Execution**, find the Ticket and click **Stop**; then inspect the working copy under:

```text
/home/administrator/.dsh/state/superagent/work/
```

For real projects, review and roll back with Git commits.

### Q5: Do I need GitHub or Feishu?

No.

- **Sidebar only**: no external account is needed;
- **GitHub**: needs a dedicated account and `gh`;
- **Feishu**: needs a Feishu bot and the corresponding CLI;
- **Gitea/GitLab**: needs a webhook and an API token, and the service must be reachable.

For first use, keep the default panel + local repository.

### Q6: Will it be expensive

Every message triggers an Eval; once accepted it also starts an execution task, which may call the model several times. Do not flood it with repeated messages, and do not stuff a large amount of unrelated content in at once.

### Q7: Where is the data stored

```text
/home/administrator/.dsh/state/superagent/
```

It holds the database, logs, Ticket working directories and runtime state. Back up this directory before upgrading or migrating.

---

## 12. Safety boundaries

Please treat Superagent as an **intern who is capable but needs supervision**:

1. **It really changes files**; it does not just give advice;
2. **It may misunderstand**, especially with vague requests;
3. **Its replies are not necessarily 100% correct**; verify important conclusions yourself;
4. **the token is a key**; do not screenshot it into a group chat, and do not commit it to Git;
5. **do not paste passwords, private keys or API keys**;
6. **use a copy of a real repository first**, and connect the real one after you have confirmed its behavior;
7. the current project is a research prototype and is not recommended for direct production use.

---

## 13. Ten-minute quick start checklist

- [ ] Open the `3082` address with the token
- [ ] Click **Superagent** in the left sidebar
- [ ] Click **Trigger** at the top
- [ ] Enter: `Please look at the current repository in read-only mode, introduce it in three sentences, and do not modify any file.`
- [ ] Press `Ctrl/⌘ + Enter` to send
- [ ] Wait for the status to change from "Evaluating" to "Ended"
- [ ] Read the reply
- [ ] Open **Execution** and take a look at the Ticket details
- [ ] Follow up with one more sentence in the same conversation
- [ ] Confirm that you can stop a Ticket, stop the service and check the status

After these ten steps you already know how to use it.

---

## 14. Where to learn more

- To understand the project's philosophy: read [000-philosophy.md](000-philosophy.md)
- To understand Tickets and Triggers: read [001-domain.md](001-domain.md)
- To understand authorization: read [002-authorization.md](002-authorization.md)
- To understand deployment and configuration: read [006-deployment.md](006-deployment.md)
- To add a message source yourself: read [008-cookbook.md](008-cookbook.md)

When you run into a problem, look first at the hints in **Overview**, then at the newest log under `.artifacts/`; these two places usually already state the cause.
