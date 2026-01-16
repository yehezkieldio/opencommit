#!/usr/bin/env bun
import{cli as e,command as t}from"cleye";import{confirm as n,intro as r,isCancel as i,multiselect as a,outro as o,select as s,spinner as c,text as l}from"@clack/prompts";import u from"chalk";import{execa as d}from"execa";import{existsSync as f,readFileSync as p,writeFileSync as m}from"fs";import{homedir as h}from"os";import{join as g,resolve as ee}from"path";import{parse as te,stringify as _}from"ini";import ne from"axios";import{AzureOpenAI as re}from"openai";import v from"@dqbd/tiktoken/encoders/cl100k_base.json"with{type:"json"};import{Tiktoken as ie}from"@dqbd/tiktoken/lite";import ae from"ignore";var oe=`3.2.10`,se=`Auto-generate impressive commits in 1 second. Killing lame commits with AI 🤯🔫`;const ce={config:`config`},y={OCO_API_KEY:`OCO_API_KEY`,OCO_TOKENS_MAX_INPUT:`OCO_TOKENS_MAX_INPUT`,OCO_TOKENS_MAX_OUTPUT:`OCO_TOKENS_MAX_OUTPUT`,OCO_DESCRIPTION:`OCO_DESCRIPTION`,OCO_EMOJI:`OCO_EMOJI`,OCO_MODEL:`OCO_MODEL`,OCO_WHY:`OCO_WHY`,OCO_MESSAGE_TEMPLATE_PLACEHOLDER:`OCO_MESSAGE_TEMPLATE_PLACEHOLDER`,OCO_AI_PROVIDER:`OCO_AI_PROVIDER`,OCO_ONE_LINE_COMMIT:`OCO_ONE_LINE_COMMIT`,OCO_API_URL:`OCO_API_URL`,OCO_API_CUSTOM_HEADERS:`OCO_API_CUSTOM_HEADERS`,OCO_OMIT_SCOPE:`OCO_OMIT_SCOPE`,OCO_GITPUSH:`OCO_GITPUSH`},b={get:`get`,set:`set`,describe:`describe`},x={azure:[`gpt-4.1-mini`]},le=e=>x.azure[0]||`gpt-4.1-mini`,S={DEFAULT_MAX_TOKENS_INPUT:4096,DEFAULT_MAX_TOKENS_OUTPUT:500},C=(e,t,n)=>{t||(o(`${u.red(`✖`)} wrong value for ${e}: ${n}.`),o(`For more help refer to docs https://github.com/di-sukharev/opencommit`),process.exit(1))},w={[y.OCO_API_KEY](e){return C(`OCO_API_KEY`,!!e,`You need to provide the OCO_API_KEY when OCO_AI_PROVIDER set to "azure".`),e},[y.OCO_DESCRIPTION](e){return C(y.OCO_DESCRIPTION,typeof e==`boolean`,`Must be boolean: true or false`),e},[y.OCO_API_CUSTOM_HEADERS](e){try{return typeof e==`string`&&JSON.parse(e),e}catch{C(y.OCO_API_CUSTOM_HEADERS,!1,`Must be a valid JSON string of headers`)}},[y.OCO_TOKENS_MAX_INPUT](e){return e=Number.parseInt(String(e),10),C(y.OCO_TOKENS_MAX_INPUT,!Number.isNaN(e),`Must be a number`),e},[y.OCO_TOKENS_MAX_OUTPUT](e){return e=Number.parseInt(String(e),10),C(y.OCO_TOKENS_MAX_OUTPUT,!Number.isNaN(e),`Must be a number`),e},[y.OCO_EMOJI](e){return C(y.OCO_EMOJI,typeof e==`boolean`,`Must be boolean: true or false`),e},[y.OCO_OMIT_SCOPE](e){return C(y.OCO_OMIT_SCOPE,typeof e==`boolean`,`Must be boolean: true or false`),e},[y.OCO_API_URL](e){return C(y.OCO_API_URL,typeof e==`string`,`${e} is not a valid URL. It should start with 'http://' or 'https://'.`),e},[y.OCO_MODEL](e){return C(y.OCO_MODEL,typeof e==`string`,`${e} is not supported.`),e},[y.OCO_MESSAGE_TEMPLATE_PLACEHOLDER](e){return C(y.OCO_MESSAGE_TEMPLATE_PLACEHOLDER,e.startsWith(`$`),`${e} must start with $, for example: '$msg'`),e},[y.OCO_GITPUSH](e){return C(y.OCO_GITPUSH,typeof e==`boolean`,`Must be true or false`),e},[y.OCO_AI_PROVIDER](e){return C(y.OCO_AI_PROVIDER,e===`azure`,`${e} is not supported, use 'azure'`),e},[y.OCO_ONE_LINE_COMMIT](e){return C(y.OCO_ONE_LINE_COMMIT,typeof e==`boolean`,`Must be true or false`),e},[y.OCO_WHY](e){return C(y.OCO_WHY,typeof e==`boolean`,`Must be true or false`),e}},T={AZURE:`azure`},E=g(h(),`.opencommit`);ee(process.cwd(),`.env`);const D={OCO_TOKENS_MAX_INPUT:S.DEFAULT_MAX_TOKENS_INPUT,OCO_TOKENS_MAX_OUTPUT:S.DEFAULT_MAX_TOKENS_OUTPUT,OCO_DESCRIPTION:!1,OCO_EMOJI:!1,OCO_MODEL:le(`azure`),OCO_MESSAGE_TEMPLATE_PLACEHOLDER:`$msg`,OCO_AI_PROVIDER:T.AZURE,OCO_ONE_LINE_COMMIT:!1,OCO_WHY:!1,OCO_OMIT_SCOPE:!1,OCO_GITPUSH:!0},ue=(e=E)=>(m(e,_(D),`utf8`),D),O=e=>{try{return typeof e==`string`?JSON.parse(e):e}catch{return e}},de=()=>({OCO_MODEL:process.env.OCO_MODEL,OCO_API_URL:process.env.OCO_API_URL,OCO_API_KEY:process.env.OCO_API_KEY,OCO_API_CUSTOM_HEADERS:process.env.OCO_API_CUSTOM_HEADERS,OCO_AI_PROVIDER:process.env.OCO_AI_PROVIDER,OCO_TOKENS_MAX_INPUT:O(process.env.OCO_TOKENS_MAX_INPUT),OCO_TOKENS_MAX_OUTPUT:O(process.env.OCO_TOKENS_MAX_OUTPUT),OCO_DESCRIPTION:O(process.env.OCO_DESCRIPTION),OCO_EMOJI:O(process.env.OCO_EMOJI),OCO_MESSAGE_TEMPLATE_PLACEHOLDER:process.env.OCO_MESSAGE_TEMPLATE_PLACEHOLDER,OCO_ONE_LINE_COMMIT:O(process.env.OCO_ONE_LINE_COMMIT),OCO_OMIT_SCOPE:O(process.env.OCO_OMIT_SCOPE),OCO_GITPUSH:O(process.env.OCO_GITPUSH)}),fe=(e,t=E)=>{m(t,_(e),`utf8`)},pe=(e=E)=>f(e),me=(e=E)=>{let t;return t=pe(e)?te(p(e,`utf8`)):ue(e),t},k=(e,t)=>{let n=new Set([...Object.keys(e),...Object.keys(t)]);return Array.from(n).reduce((n,r)=>(n[r]=O(e[r]??t[r]),n),{})},he=e=>Object.fromEntries(Object.entries(e).map(([e,t])=>{try{return typeof t==`string`?t===`undefined`?[e,void 0]:t===`null`?[e,null]:[e,JSON.parse(t)]:[e,t]}catch{return[e,t]}})),A=({globalPath:e=E}={})=>he(k(de(),me(e))),ge=(e,t=E)=>{let n=A({globalPath:t}),r={};for(let[t,n]of e){if(!Object.hasOwn(w,t)){let e=Object.keys(w).join(`
`);throw Error(`Unsupported config key: ${t}. Expected keys are:\n\n${e}.\n\nFor more help refer to our docs: https://github.com/di-sukharev/opencommit`)}let e;try{e=typeof n==`string`?JSON.parse(n):n}catch{e=n}r[t]=w[t](e)}fe(k(r,n),t),o(`${u.green(`✔`)} config successfully set`)};function j(e){switch(e){case y.OCO_MODEL:return{description:`The AI model to use for generating commit messages`,values:x};case y.OCO_AI_PROVIDER:return{description:`The AI provider to use`,values:Object.values(T)};case y.OCO_DESCRIPTION:return{description:`Postface a message with ~3 sentences description of the changes`,values:[`true`,`false`]};case y.OCO_EMOJI:return{description:`Preface a message with GitMoji`,values:[`true`,`false`]};case y.OCO_WHY:return{description:`Output a short description of why the changes were done after the commit message (default: false)`,values:[`true`,`false`]};case y.OCO_OMIT_SCOPE:return{description:`Do not include a scope in the commit message`,values:[`true`,`false`]};case y.OCO_GITPUSH:return{description:`Push to git after commit (deprecated). If false, oco will exit after committing`,values:[`true`,`false`]};case y.OCO_TOKENS_MAX_INPUT:return{description:`Max model token limit`,values:[`Any positive integer`]};case y.OCO_TOKENS_MAX_OUTPUT:return{description:`Max response tokens`,values:[`Any positive integer`]};case y.OCO_API_KEY:return{description:`API key for the selected provider`,values:[`String (required for most providers)`]};case y.OCO_API_URL:return{description:`Custom API URL - may be used to set proxy path to OpenAI API`,values:[`URL string (must start with 'http://' or 'https://')`]};case y.OCO_MESSAGE_TEMPLATE_PLACEHOLDER:return{description:`Message template placeholder`,values:[`String (must start with $)`]};case y.OCO_ONE_LINE_COMMIT:return{description:`One line commit message`,values:[`true`,`false`]};default:return{description:`String value`,values:[`Any string`]}}}function _e(e){if(!Object.values(y).includes(e)){console.log(u.red(`Unknown config parameter: ${e}`));return}let t=j(e),n=t.description,r;if(e in D&&(r=D[e]),console.log(u.bold(`\n${e}:`)),console.log(u.gray(`  Description: ${n}`)),r!==void 0&&console.log(u.gray(`  Default: ${r}`)),Array.isArray(t.values)){console.log(u.gray(`  Accepted values:`));for(let e of t.values)console.log(u.gray(`    - ${e}`))}else{console.log(u.gray(`  Accepted values by provider:`));for(let[e,n]of Object.entries(t.values)){console.log(u.gray(`    ${e}:`));for(let e of n)console.log(u.gray(`      - ${e}`))}}}function ve(){console.log(u.bold(`Available config parameters:`));for(let e of Object.values(y).sort()){let t=j(e),n;e in D&&(n=D[e]),console.log(u.bold(`\n${e}:`)),console.log(u.gray(`  Description: ${t.description}`)),n!==void 0&&console.log(u.gray(`  Default: ${n}`))}console.log(u.yellow(`
Use "oco config describe [PARAMETER]" to see accepted values and more details for a specific config parameter.`))}const ye=t({name:ce.config,parameters:[`<mode>`,`[key=values...]`],help:{description:`Configure opencommit settings`,examples:[`Describe all config parameters: oco config describe`,`Describe a specific parameter: oco config describe OCO_MODEL`,`Get a config value: oco config get OCO_MODEL`,`Set a config value: oco config set OCO_MODEL=gpt-4`]}},async e=>{try{let{mode:t,keyValues:n}=e._;if(r(`COMMAND: config ${t} ${n}`),t===b.describe){if(!n||n.length===0)ve();else for(let e of n)_e(e);process.exit(0)}else if(t===b.get){if(!n||n.length===0)throw Error(`No config keys specified for get mode`);let e=A()||{};for(let t of n)o(`${t}=${e[t]}`)}else if(t===b.set){if(!n||n.length===0)throw Error(`No config keys specified for set mode`);await ge(n.map(e=>e.split(`=`)))}else throw Error(`Unsupported mode: ${t}. Valid modes are: "set", "get", and "describe"`)}catch(e){o(`${u.red(`✖`)} ${e}`),process.exit(1)}}),M=A(),N=`You are to act as an author of a commit message in git.`,P=`
## Critical Output Rules:
- You MUST generate exactly ONE commit message
- NEVER output multiple commit headers (e.g., "feat: X\\n\\nfix: Y" is INVALID)
- If multiple things changed, pick the most significant type
- Use the commit body to mention secondary changes if needed
- When in doubt, prefer: feat > fix > refactor > chore`,F={role:`system`,content:`You are a code analyst. Analyze the following git diff and extract the key technical changes.

## Instructions:
- Return a concise bulleted list of changes (3-5 items max)
- Focus on WHAT changed, not WHY
- Include file names where relevant
- Do NOT write a commit message or commit header
- Do NOT use prefixes like "feat:", "fix:", etc.
- Be technical and specific
- Keep each bullet point to one line

## Example Output:
- Added user authentication middleware in \`auth.ts\`
- Updated API endpoint path from /v1 to /v2 in \`routes.ts\`
- Fixed null pointer exception in error handler
- Removed deprecated logging utility`},I=`Follow these commit message guidelines:

## Format Structure
type(scope): description
- Length: ≤ 50 characters total
- Case: lowercase except proper nouns
- Voice: imperative mood ("add" not "adds" or "added")
- Punctuation: no period at end
- Style: concise, direct, actionable

## Type Classification (Priority Order)
### Primary Types:
- feat: new functionality, components, or user-facing features
- fix: bug fixes, error handling, or corrections
- refactor: code restructuring without behavior changes
- perf: performance optimizations or improvements
- chore: maintenance, dependencies, tooling, configuration, or broad non-source code changes

### Secondary Types:
- deps, fix(deps), chore(deps), build(deps): dependency additions, upgrades, or removals
- i18n, locale, translation: internationalization and localization changes
- style, format: formatting, whitespace, linting fixes
- security: vulnerability fixes or security improvements
- revert: reverting previous commits
- build: build system or tooling changes
- compat: compatibility updates
- test: adding/modifying tests without production code changes
- ci: CI/CD pipeline, build, or deployment configuration
- docs: documentation changes only, either markdown or code comments
- deprecated: deprecation notices

## Scope Determination Rules
### For src/ changes:
- Use specific module/component name: auth, api, ui, core, utils
- File-based: parser, validator, router, middleware
- Feature-based: login, dashboard, notifications

### For non-src/ changes:
- Dependencies: deps
- Configuration: config
- Build/tooling: build, ci
- Documentation: docs
- Root files: omit scope

### Scope Selection Priority:
1. Most specific affected component
2. If multiple components: use parent module or omit scope
3. If unclear: omit scope rather than guess

## Decision Tree
1. Is this a dependency change? -> chore(deps): action dependency package-name
2. Is this outside src/ directory? -> chore(scope): action
3. Is this adding new functionality in src/? -> feat(scope): action
4. Is this fixing a bug/error in src/? -> fix(scope): action
5. Is this restructuring code without changing behavior? -> refactor(scope): action
6. Otherwise, use most specific type from list

## Description Writing Rules
### DO:
- Start with action verb: "add", "remove", "update", "fix", "refactor"
- Be specific: "add user authentication" not "add auth stuff"
- Use present tense imperative: "implement" not "implemented"
- Focus on WHAT changed, not WHY

### DON'T:
- Use vague terms: "update things", "fix stuff", "improve code"
- Add explanations: "fix bug (was causing crashes)"
- Include ticket numbers: "fix USER-123"
- Use gerunds: "adding" instead of "add"

## Edge Cases
- Multiple types in one commit: Choose the most significant change. If equal significance, prefer: feat > fix > refactor > chore
- Multiple scopes affected: Use parent scope if logical grouping exists, omit scope if no clear parent`,be=()=>I,L=()=>M.OCO_DESCRIPTION?`Add a short description of WHY the changes are done after the commit message. Don't start it with "This commit", just describe the changes.`:`Don't add any descriptions to the commit, only commit message.`,R=()=>M.OCO_ONE_LINE_COMMIT?`Craft a concise, single sentence, commit message that encapsulates all changes made, with an emphasis on the primary updates. If the modifications share a common theme or scope, mention it succinctly; otherwise, leave the scope out to maintain focus. The goal is to provide a clear and unified overview of the changes in one single message.`:``,z=()=>M.OCO_OMIT_SCOPE?`Do not include a scope in the commit message format. Use the format: <type>: <subject>`:``,B=e=>e!==``&&e!==` `?`Additional context provided by the user: <context>${e}</context>\nConsider this context when generating the commit message, incorporating relevant information when appropriate.`:``,xe=e=>({role:`system`,content:`${`${N} Your mission is to create clean and comprehensive commit messages following the Conventional Commit Convention and explain WHAT were the changes and mainly WHY the changes were done.`}\nI'll send you an output of 'git diff --staged' command, and you are to convert it into a commit message.\n${be()}\n${P}\n${L()}\n${R()}\n${z()}\nUse the present tense. Lines must not be longer than 74 characters. Use English for the commit message.\n${B(e)}`}),Se={role:`user`,content:`diff --git a/src/server.ts b/src/server.ts
    index ad4db42..f3b18a9 100644
    --- a/src/server.ts
    +++ b/src/server.ts
    @@ -10,7 +10,7 @@
    import {
        initWinstonLogger();

        const app = express();
        -const port = 7799;
        +const PORT = 7799;

        app.use(express.json());

        @@ -34,6 +34,6 @@
        app.use((_, res, next) => {
            // ROUTES
            app.use(PROTECTED_ROUTER_URL, protectedRouter);

            -app.listen(port, () => {
                -  console.log(\`Server listening on port \${port}\`);
                +app.listen(process.env.PORT || PORT, () => {
                    +  console.log(\`Server listening on port \${PORT}\`);
                });`},Ce=e=>({role:`system`,content:`${`${N}

You will receive a summary of all changes across multiple files/chunks in a git commit.
Your task is to write **exactly ONE** commit message that covers all changes.`}
${I}
${P}
${L()}
${R()}
${z()}
Use the present tense. Lines must not be longer than 74 characters. Use English for the commit message.
${B(e)}`}),V=async e=>[xe(e),Se];function we(e,t){if(!e||typeof e!=`string`)return e;let n=`<${t}>`,r=`</${t}>`,i=``,a=null,o=0;for(let t=0;t<e.length;t++){if(e.substring(t,t+n.length)===n){if(o++,o===1){a=e.indexOf(r,t+n.length),t=t+n.length-1;continue}}else if(e.substring(t,t+r.length)===r&&o>0&&(o--,o===0)){t=t+r.length-1,a=null;continue}a===null&&(i+=e[t])}return i=i.replace(/[ \t]+/g,` `).trim(),i}let H=null;function Te(){return H||=new ie(v.bpe_ranks,v.special_tokens,v.pat_str),H}function U(e){return Te().encode(e).length}var Ee=class{config;client;constructor(e){this.config=e,this.client=new re({endpoint:this.config.baseURL,apiKey:this.config.apiKey,apiVersion:`2024-08-01-preview`})}generateCommitMessage=async e=>{try{if(e.map(e=>U(e.content)+4).reduce((e,t)=>e+t,0)>this.config.maxTokensInput-this.config.maxTokensOutput)throw Error(K.tooMuchTokens);let t=(await this.client.chat.completions.create({model:this.config.model,messages:e})).choices[0].message;if(t?.content===null)return;let n=t?.content;return we(n,`think`)}catch(e){o(`${u.red(`✖`)} ${this.config.model}`);let t=e;if(o(`${u.red(`✖`)} ${JSON.stringify(e)}`),ne.isAxiosError(e)&&e.response?.status===401){let t=e.response.data.error;t?.message&&o(t.message),o(`For help look into README https://github.com/di-sukharev/opencommit#setup`)}throw t}}};function De(e){let t={};if(!e)return t;try{t=typeof e==`object`&&!Array.isArray(e)?e:JSON.parse(e)}catch{console.warn(`Invalid OCO_API_CUSTOM_HEADERS format, ignoring custom headers`)}return t}function W(){let e=A(),t=e.OCO_AI_PROVIDER,n=De(e.OCO_API_CUSTOM_HEADERS),r={model:e.OCO_MODEL,maxTokensOutput:e.OCO_TOKENS_MAX_OUTPUT,maxTokensInput:e.OCO_TOKENS_MAX_INPUT,baseURL:e.OCO_API_URL??``,apiKey:e.OCO_API_KEY??``,customHeaders:n};if(t===T.AZURE)return new Ee(r);throw Error(`Unsupported provider: ${t}. Only 'azure' is supported.`)}const Oe=/^a\/(.+?)\s+b\//,ke=/\+\+\+ b\/(.+)/;function Ae(e){let t=e.match(Oe);if(t)return t[1];let n=e.match(ke);return n?n[1]:`unknown`}function je(e,t){let n=[],r=e[0];for(let i of e.slice(1))U(r+i)<=t?r+=i:(n.push(r),r=i);return n.push(r),n}function G(e,t){if(t<=0)return``;if(U(e)<=t)return e;let n=0,r=e.length,i=``;for(;n<r;){let a=Math.floor((n+r+1)/2),o=e.substring(0,a);U(o)<=t?(i=o,n=a):r=a-1}return i}function Me(e,t){if(t<=0)throw Error(`maxTokens must be positive`);let n=[],r=e;for(;r.length>0;){if(U(r)<=t){n.push(r);break}let e=G(r,t);e.length===0?(n.push(r.substring(0,1)),r=r.substring(1)):(n.push(e),r=r.substring(e.length))}return n}function Ne(e){let{promptMessages:t,maxInputTokens:n,maxOutputTokens:r,adjustmentFactor:i=20}=e,a=t.reduce((e,t)=>e+U(t.content)+4,0),o=n-i-a-r;return o<=0?{maxDiffTokens:o,promptTokens:a,isValid:!1,errorReason:`Token budget exhausted: prompt uses ${a} tokens, output reserves ${r} tokens, but max input is only ${n}. Try reducing OCO_TOKENS_MAX_OUTPUT or using a model with higher context limits.`}:{maxDiffTokens:o,promptTokens:a,isValid:!0}}var Pe=class extends Error{constructor(e){super(e),this.name=`TokenBudgetError`}};const Fe=[`feat`,`fix`,`refactor`,`perf`,`chore`,`deps`,`i18n`,`locale`,`translation`,`style`,`format`,`security`,`revert`,`build`,`compat`,`test`,`ci`,`docs`,`deprecated`],Ie=RegExp(`^(${Fe.join(`|`)})(\\([^)]+\\))?:\\s*.+`,`i`),Le=RegExp(`^(${Fe.join(`|`)})(\\([^)]+\\))?:\\s*.+`,`gim`);function Re(e,t={}){let{maxSubjectLength:n=50,requireScope:r=!1}=t,i=[],a=e.trim().split(`
`);if(a.length===0||!a[0].trim())return{isValid:!1,errors:[`Empty commit message`],headerCount:0};let o=a[0].trim();Ie.test(o)||i.push(`First line is not a valid conventional commit header: "${o}"`);let s=o.indexOf(`:`);if(s>-1){let e=o.substring(s+1).trim();e.length>n&&i.push(`Subject line exceeds ${n} characters (${e.length})`)}r&&!o.includes(`(`)&&i.push(`Scope is required but not present`);let c=e.match(Le)||[],l=c.slice(1);return l.length>0&&i.push(`Multiple commit headers detected. Only one header is allowed. Additional headers found: ${l.join(`, `)}`),{isValid:i.length===0,errors:i,headerCount:c.length,firstHeader:c[0],additionalHeaders:l}}async function ze(e){let t=W(),n=[{role:`system`,content:`You are a commit message formatter. The following commit message is invalid because it contains multiple headers or doesn't follow conventional commit format.

Rewrite it as EXACTLY ONE valid conventional commit message.

Rules:
- Use format: type(scope): subject
- Pick the most significant type if multiple changes exist
- Keep subject under 50 characters
- Mention other changes in the body if needed
- Types: feat, fix, refactor, perf, chore, docs, test, ci, build, style, revert

Output ONLY the rewritten commit message, nothing else.`},{role:`user`,content:e}];try{let e=await t.generateCommitMessage(n);if(e&&Re(e).isValid)return e}catch{}return null}function Be(e,t){if(!t.firstHeader)return`chore: ${e.trim().split(`
`)[0].substring(0,50)}`;if(!t.additionalHeaders||t.additionalHeaders.length===0)return e;let n=e.split(`
`),r=[];for(let e of n.slice(1))Ie.test(e.trim())?r.push(`- ${e.trim()}`):r.push(e);let i=r.join(`
`).trim();return i?`${t.firstHeader}\n\n${i}`:t.firstHeader}async function Ve(e,t={}){let n=Re(e,t);return n.isValid?e:n.headerCount>1?await ze(e)||Be(e,n):e}const He=A(),Ue=He.OCO_TOKENS_MAX_INPUT,We=He.OCO_TOKENS_MAX_OUTPUT,K={tooMuchTokens:`TOO_MUCH_TOKENS`,internalError:`INTERNAL_ERROR`,emptyMessage:`EMPTY_MESSAGE`,outputTokensTooHigh:`Token limit exceeded, OCO_TOKENS_MAX_OUTPUT must not be much higher than the default ${S.DEFAULT_MAX_TOKENS_OUTPUT} tokens.`},Ge=/^diff --git /m,Ke=/^@@ /m,qe=async(e,t)=>[...await V(t),{role:`user`,content:e}];function q(e){let t=Math.min(500*2**e,1e4),n=t+Math.random()*t*.5;return new Promise(e=>setTimeout(e,n))}function J(e,t){if(t<=0)throw Error(K.outputTokensTooHigh);let n=e.split(`
`),r=[],i=``;for(let e of n){if(U(e)>t){i&&=(r.push(i),``);let n=Me(e,t);r.push(...n);continue}let n=i+(i?`
`:``)+e;U(n)>t?(i&&r.push(i),i=e):i=n}return i&&r.push(i),r}function Je(e,t){let n=e.split(Ge).slice(1).map(e=>`diff --git ${e}`),r=[],i={content:``,files:[],tokenCount:0};for(let e of n){let n=U(e),a=Ae(e.substring(11));if(i.tokenCount+n>t&&i.content&&(r.push(i),i={content:``,files:[],tokenCount:0}),n>t){i.content&&(r.push(i),i={content:``,files:[],tokenCount:0});let n=Ye(e,t);for(let e of n)r.push({content:e,files:[a],tokenCount:U(e)})}else i.content+=e,i.files.push(a),i.tokenCount+=n}return i.content&&r.push(i),r}function Ye(e,t){let n=e.match(Ke);if(!n||n.index===void 0)return J(e,t);let r=e.substring(0,n.index),i=e.substring(n.index),a=U(r);if(a>=t)return J(e,t);let o=je(i.split(Ke).slice(1).map(e=>`@@ ${e}`),t-a),s=[];for(let e of o){let n=r+e;if(U(n)>t){let e=J(n,t);s.push(...e)}else s.push(n)}return s}async function Xe(e,t,n){let r=e.map((e,t)=>({item:e,index:t})),i=[];for(;r.length>0||i.length>0;){for(;i.length<n&&r.length>0;){let e=r.shift();if(!e)break;let{item:n,index:a}=e,o=t(n,a).finally(()=>{let e=i.indexOf(o);e>-1&&i.splice(e,1)});i.push(o)}i.length>0&&await Promise.race(i)}}async function Ze(e){let t=W(),n=Array(e.length),r=0;return await Xe(e,async(e,i)=>{let a=[F,{role:`user`,content:e.content}];Date.now()-r<500&&await q(0),r=Date.now();let o=0;for(;o<3;)try{n[i]={summary:await t.generateCommitMessage(a)||`Changes in: ${e.files.join(`, `)}`,files:e.files};return}catch{o++,o<3&&await q(o)}n[i]={summary:`Changes in: ${e.files.join(`, `)}`,files:e.files}},2),n}async function Qe(e,t){let n=W(),r=e.map(e=>`${e.files.length>0?`**Files:** ${e.files.join(`, `)}\n`:``}${e.summary}`).join(`

---

`),i=Ce(t),a=Ue-U(i.content)-We-20,o=r;U(r)>a&&(o=await $e(e,a,0));let s=[i,{role:`user`,content:`Here is a summary of all changes in this commit:\n\n${o}`}],c=await n.generateCommitMessage(s);if(!c)throw Error(K.emptyMessage);return await Ve(c)}async function $e(e,t,n){if(n>=5)return G(e.map(e=>e.summary).join(`
`),t);let r=W(),i=[],a=[],o=0;for(let n of e){let e=U(n.summary);o+e>t/2&&a.length>0&&(i.push(a),a=[],o=0),a.push(n),o+=e}if(a.length>0&&i.push(a),i.length<=1)return G(e.map(e=>e.summary).join(`
`),t);let s=[];for(let e=0;e<i.length;e++){let t=i[e],n=t.map(e=>e.summary).join(`
`),a=t.flatMap(e=>e.files),o=[F,{role:`user`,content:`Consolidate these changes into a shorter summary:\n\n${n}`}],c=null,l=0;for(;l<3&&!c;)try{c=await r.generateCommitMessage(o)}catch{l++,l<3&&await q(l)}s.push({summary:c||G(n,500),files:a}),e<i.length-1&&await q(0)}let c=s.map(e=>e.summary).join(`

`);return U(c)>t?$e(s,t,n+1):c}const et=async(e,t=``)=>{let n=Ne({promptMessages:await V(t),maxInputTokens:Ue,maxOutputTokens:We,adjustmentFactor:20});if(!n.isValid)throw new Pe(n.errorReason??`Token budget exceeded`);if(U(e)<=n.maxDiffTokens){let n=await qe(e,t),r=await W().generateCommitMessage(n);if(!r)throw Error(K.emptyMessage);return await Ve(r)}return await Qe(await Ze(Je(e,n.maxDiffTokens)),t)},tt=async()=>{try{await d(`git`,[`rev-parse`])}catch(e){throw Error(e)}},nt=async()=>{let e=await Y(),t=ae();try{t.add(p(g(e,`.opencommitignore`)).toString().split(`
`))}catch{}return t},rt=async()=>{let{stdout:e}=await d(`git`,[`diff`,`--name-only`,`--cached`,`--relative`],{cwd:await Y()});if(!e)return[];let t=e.split(`
`),n=await nt(),r=t.filter(e=>!n.ignores(e));return r?r.sort():[]},it=async()=>{let e=await Y(),{stdout:t}=await d(`git`,[`ls-files`,`--modified`],{cwd:e}),{stdout:n}=await d(`git`,[`ls-files`,`--others`,`--exclude-standard`],{cwd:e});return[...t.split(`
`),...n.split(`
`)].filter(e=>!!e).sort()},at=async({files:e})=>{let t=await Y(),n=c();n.start(`Adding files to commit`),await d(`git`,[`add`,...e],{cwd:t}),n.stop(`Staged ${e.length} files`)},ot=async({files:e})=>{let t=await Y(),n=e.filter(e=>e.includes(`.lock`)||e.includes(`-lock.`)||e.includes(`.svg`)||e.includes(`.png`)||e.includes(`.jpg`)||e.includes(`.jpeg`)||e.includes(`.webp`)||e.includes(`.gif`));n.length&&o(`Some files are excluded by default from 'git diff'. No commit messages are generated for this files:\n${n.join(`
`)}`);let{stdout:r}=await d(`git`,[`diff`,`--staged`,`--`,...e.filter(e=>!(e.includes(`.lock`)||e.includes(`-lock.`)))],{cwd:t});return r},Y=async()=>{let{stdout:e}=await d(`git`,[`rev-parse`,`--show-toplevel`]);return e},X=async e=>{try{return[await e,null]}catch(e){if(e instanceof Error)return[null,e];throw e}},Z=A(),st=async()=>{let{stdout:e}=await d(`git`,[`remote`]);return e.split(`
`).filter(e=>!!e.trim())},ct=e=>{for(let t in e)if(e[t].includes(Z.OCO_MESSAGE_TEMPLATE_PLACEHOLDER))return e[t];return!1},lt=async({diff:e,extraArgs:t,context:r=``,skipCommitConfirmation:a=!1})=>{await tt();let f=c();f.start(`Generating the commit message`);try{let p=await et(e,r),m=ct(t);if(Z.OCO_MESSAGE_TEMPLATE_PLACEHOLDER&&typeof m==`string`){let e=t.indexOf(m);t.splice(e,1),p=m.replace(Z.OCO_MESSAGE_TEMPLATE_PLACEHOLDER,p)}f.stop(`📝 Commit message generated`),o(`Generated commit message:
${u.grey(`——————————————————`)}
${p}
${u.grey(`——————————————————`)}`);let h=a?`Yes`:await s({message:`Confirm the commit message?`,options:[{value:`Yes`,label:`Yes`},{value:`No`,label:`No`},{value:`Edit`,label:`Edit`}]});if(i(h)&&process.exit(1),h===`Edit`){let e=await l({message:`Please edit the commit message: (press Enter to continue)`,initialValue:p});i(e)&&(o(`Commit cancelled`),process.exit(1));let t=e?.toString().trim()??``;t||(o(u.red(`Empty commit message. Commit cancelled.`)),process.exit(1)),p=t}if(h===`Yes`||h===`Edit`){let e=c();e.start(`Committing the changes`);let{stdout:r}=await d(`git`,[`commit`,`-m`,p,...t]);e.stop(`${u.green(`✔`)} Successfully committed`),o(r);let a=await st();if(Z.OCO_GITPUSH===!1)return;if(!a.length){let{stdout:e}=await d(`git`,[`push`]);e&&o(e),process.exit(0)}if(a.length===1){let e=await n({message:"Do you want to run `git push`?"});if(i(e)&&process.exit(1),e){let e=c();e.start(`Running 'git push ${a[0]}'`);let{stdout:t}=await d(`git`,[`push`,`--verbose`,a[0]]);e.stop(`${u.green(`✔`)} Successfully pushed all commits to ${a[0]}`),t&&o(t)}else o("`git push` aborted"),process.exit(0)}else{let e=`don't push`,t=await s({message:`Choose a remote to push to`,options:[...a,e].map(e=>({value:e,label:e}))});if(i(t)&&process.exit(1),t!==e){let e=c();e.start(`Running 'git push ${t}'`);let{stdout:n}=await d(`git`,[`push`,t]);n&&o(n),e.stop(`${u.green(`✔`)} successfully pushed all commits to ${t}`)}}}else{let r=await n({message:`Do you want to regenerate the message?`});i(r)&&process.exit(1),r&&await lt({diff:e,extraArgs:t})}}catch(e){f.stop(`${u.red(`✖`)} Failed to generate the commit message`),console.log(e);let t=e;o(`${u.red(`✖`)} ${t?.message||t}`),process.exit(1)}};async function Q(e=[],t=``,s=!1,l=!1){if(s){let e=await it();e?await at({files:e}):(o("No changes detected, write some code and run `oco` again"),process.exit(1))}let[d,f]=await X(rt()),[p,m]=await X(it());p?.length||d?.length||(o(u.red(`No changes detected`)),process.exit(1)),r(`open-commit`),(m??f)&&(o(`${u.red(`✖`)} ${m??f}`),process.exit(1));let h=c();if(h.start(`Counting staged files`),d.length===0){h.stop(`No files are staged`);let r=await n({message:`Do you want to stage all files and generate commit message?`});if(i(r)&&process.exit(1),r&&(await Q(e,t,!0),process.exit(0)),d.length===0&&p.length>0){let e=await a({message:u.cyan(`Select the files you want to add to the commit:`),options:p.map(e=>({value:e,label:e}))});i(e)&&process.exit(0),await at({files:e})}await Q(e,t,!1),process.exit(0)}h.stop(`${d.length} staged files:\n${d.map(e=>`  ${e}`).join(`
`)}`);let[,g]=await X(lt({diff:await ot({files:d}),extraArgs:e,context:t,skipCommitConfirmation:l}));g&&(o(`${u.red(`✖`)} ${g}`),process.exit(1)),process.exit(0)}const ut=async()=>{try{let{stdout:e}=await d(`npm`,[`view`,`opencommit`,`version`]);return e}catch{o(`Error while getting the latest version of opencommit`);return}},dt=async()=>{let e=await ut();if(e){let t=oe;t!==e&&o(u.yellow(`
You are not using the latest stable version of OpenCommit with new features and bug fixes.
Current version: ${t}. Latest version: ${e}.
🚀 To update run: npm i - g opencommit @latest.
        `))}},$=process.argv.slice(2);e({version:oe,name:`opencommit`,commands:[ye],flags:{fgm:{type:Boolean,description:`Use full GitMoji specification`,default:!1},context:{type:String,alias:`c`,description:`Additional user input context for the commit message`,default:``},yes:{type:Boolean,alias:`y`,description:`Skip commit confirmation prompt`,default:!1}},ignoreArgv:e=>e===`unknown-flag`||e===`argument`,help:{description:se}},async({flags:e})=>{await dt(),Q($,e.context,!1,e.yes)},$);