import subprocess
import notify2
import re
import sys
from typing import List


def get_sink_ids() -> List[int]:
    out = subprocess.check_output(["pulsemixer", "--list-sinks"]).decode()
    lines = out.split("\n")
    sink_ids = []
    for line in lines:
        if line.startswith("Sink:") and "Default" in line:
            sink_ids.append(int(re.search(r"ID: sink-(\d+)", line).groups()[0]))
    return sink_ids

def volume_up():
    for id in get_sink_ids():
        print(subprocess.run([
            "pulsemixer", "--id", str(id), "--change-volume", "+10"
        ]))


def volume_down():
    for id in get_sink_ids():
        print(subprocess.check_output([
            "pulsemixer", "--id", str(id), "--change-volume", "-10"
        ]))


def notify():
    out = subprocess.check_output([
        "pulsemixer", "--id", str(get_sink_ids()[0]), "--get-volume"
    ]).decode()
    volume_pct = int(out.split(" ")[0])
    print(volume_pct)

    volume_formatted = f"{volume_pct}% {'||' * (volume_pct // 10)}"

    notify2.init('myvolumecontrol')

    file_path = "notification_id.txt"
    try:
        notification_id = open(file_path, "r").read()
    except IOError:
        notification_id = 0

    n = notify2.Notification("", volume_formatted)
    n.id = notification_id
    n.timeout = 2000
    n.show()

    with open(file_path, "w+") as f:
        f.write(str(n.id))


def main():
    if sys.argv[1] == "up":
        volume_up()
        notify()
    elif sys.argv[1] == "down":
        volume_down()
        notify()
    else:
        print("Usage: volume <up|down>")
        sys.exit(1)


if __name__ == "__main__":
    main()


