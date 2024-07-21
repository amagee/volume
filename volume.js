import { execa, execaCommand } from "execa";
import dbus from 'dbus-next';

const getSinkIds = async ({defaultOnly = false} = {}) => {
  const out = (await execaCommand('pulsemixer --list-sinks')).stdout;
  const lines = out.split('\n');
  const sinkIds = [];
  for (const line of lines) {
    if (line.startsWith('Sink:') && (!defaultOnly || line.includes('Default'))) {
      sinkIds.push(parseInt(line.match(/ID: sink-(\d+)/)[1]));
    }
  }
  return sinkIds;
};



function setCardProfile(card, profile) {
  return execa`pactl set-card-profile ${card} ${profile}`;
}

function moveSourceOutput(stream, source) {
  return execa`pacmd move-source-output ${stream} ${source}`;
}

function moveSinkInput(stream, sink) {
  // return execa`pacmd move-sink-input ${stream} ${sink}`;
  return execa`pactl move-sink-input ${stream} ${sink}`;
}

async function getSourceOutputs() {
  const {stdout} = await execa`pactl list source-outputs`;
  const outputIds = stdout.split("\n")
    .filter(line => line.startsWith("Source Output"))
    .map(line => line.substring("Source Output #").length);
  return Array.from(new Set(outputIds));
}

async function getSinkInputs() {
  const {stdout} = await execa`pactl list sink-inputs`;
  const inputIds = stdout.split("\n")
    .filter(line => line.startsWith("Sink Input"))
    .map(line => line.substring("Sink Input #").length);
  return Array.from(new Set(inputIds));
}

async function setupJabra() {
  // This makes the Jabra available as a microphone.
  await setCardProfile("bluez_card.50_C2_75_12_3C_4B", "headset-head-unit");

  for (const output of getSourceOutputs()) {
    // Expect a bunch of "Moved failed." lines here if you have pavucontrol open.
    await moveSourceOutput(output, "bluez_source.50_C2_75_12_3C_4B.headset-head-unit");
  }
}

function connectSonyHeadphones() {
  return execa`bluetoothctl connect AC:80:0A:33:24:83`;
}

async function setHeadphonesAsSink() {
  for (const output of await getSinkInputs()) {
    // Expect a bunch of "Moved failed." lines here if you have pavucontrol open.
    await moveSinkInput(output, "bluez_sink.AC_80_0A_33_24_83.a2dp_sink");
  }
}

async function setEdirolAsSink() {
  for (const input of await getSinkInputs()) {
    // Expect a bunch of "Moved failed." lines here if you have pavucontrol open.
    // await moveSinkInput(output, "alsa_output.usb-Roland_EDIROL_UA-25-00.analog-stereo");
    console.log(input);
    await moveSinkInput(input, "alsa_output.usb-Roland_EDIROL_UA-25-00.pro-output-0");
  }
}

const volumeUp = async () => {
  for (const id of await getSinkIds()) {
    await execaCommand(`pulsemixer --id ${id} --change-volume +10`);
  }
};

const volumeDown = async () => {
  for (const id of await getSinkIds()) {
    await execaCommand(`pulsemixer --id ${id} --change-volume -10`);
  }
};

async function withNotifier(cb) {
  let sessionBus;
  try {
    sessionBus = dbus.sessionBus();
    const obj = await sessionBus.getProxyObject(
      'org.freedesktop.Notifications',
      '/org/freedesktop/Notifications'
    );
    const iface = obj.getInterface('org.freedesktop.Notifications');

    await cb(iface);
  }
  finally {
    try {
      sessionBus.disconnect();
    }
    catch (e) { }
  }
}

function ifaceNotify(
  iface,
  {
    appName,
    replacesId,
    appIcon,
    summary,
    body,
    actions,
    hints,
    expireTimeout
  }
) {
  return iface.Notify(
    appName,
    replacesId,
    appIcon,
    summary,
    body,
    actions,
    hints,
    expireTimeout
  );
}

async function notifyCurrentVolume() {
  const out = (await execaCommand(`pulsemixer --id ${(await getSinkIds())[0]} --get-volume`)).stdout;
  const volumePct = parseInt(out.split(' ')[0]);
  const volumeFormatted = `${volumePct}% ${'||'.repeat(volumePct / 10)}`;

  await withNotifier((iface) => {
    return ifaceNotify(iface, {
      appName: "volume",
      replacesId: 0,
      appIcon: "",
      summary: "Volume",
      body: volumeFormatted,
      actions: [],
      hints: {}, // In other libs this is []
      expireTimeout: 1000,
    });
  });
}

const main = async () => {
  const cmd = process.argv.at(-1);
  if (cmd === 'up') {
    await volumeUp();
    await notifyCurrentVolume();
  }
  else if (cmd === 'down') {
    await volumeDown();
    await notifyCurrentVolume();
  }
  else if (cmd === 'get-outputs') {
    console.log(await getSourceOutputs());
  }
  else if (cmd === 'get-inputs') {
    console.log(await getSinkInputs());
  }
  else if (cmd === 'connect-sony-headphones') {
    await connectSonyHeadphones();
  }
  else if (cmd === 'set-headphones-as-sink') {
    await setHeadphonesAsSink();
  }
  else if (cmd === 'set-edirol-as-sink') {
    await setEdirolAsSink();
  }
  else {
    console.log('Usage: volume <up|down>');
    process.exit(1);
  }
};

main();
