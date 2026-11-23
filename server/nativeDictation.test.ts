import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { dictationSupported } from "../src/lib/dictation.ts";

/* الإملاء الصوتي: مخفي داخل غلاف iOS، وفي المتصفح يعمل كما كان. */
class FakeRecognition {}
const setWindow = (w: unknown) => { (globalThis as any).window = w; };
test.afterEach(() => { delete (globalThis as any).window; });

test("browser: supported when SpeechRecognition or webkitSpeechRecognition exists", () => {
  setWindow({ SpeechRecognition: FakeRecognition });
  assert.equal(dictationSupported(), true);
  setWindow({ webkitSpeechRecognition: FakeRecognition });
  assert.equal(dictationSupported(), true);
  setWindow({});
  assert.equal(dictationSupported(), false);
});

test("browser: Capacitor web platform does not hide dictation", () => {
  setWindow({ webkitSpeechRecognition: FakeRecognition, Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } });
  assert.equal(dictationSupported(), true);
});

test("in-app: hidden even though webkitSpeechRecognition is exposed", () => {
  setWindow({ webkitSpeechRecognition: FakeRecognition, Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } });
  assert.equal(dictationSupported(), false);
});

test("TeachView still gates every mic button on dictation.supported, and uses the shared detector", () => {
  const teach = fs.readFileSync("src/components/views/TeachView.tsx", "utf8");
  assert.equal((teach.match(/dictation\.supported&&<button/g) || []).length, 2);
  assert.match(fs.readFileSync("src/lib/dictation.ts", "utf8"), /import \{ isAppleNativeShell \} from "\.\/platform"/);
});
