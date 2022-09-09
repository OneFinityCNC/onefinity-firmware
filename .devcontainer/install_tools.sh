#!/usr/bin/env -S bash -e

APT_PACKAGES=(
	"build-essential"
	"git"
	"wget"
	"binfmt-support"
	"qemu"
	"gcc-9"
	"parted"
	"udev"
	"zerofree"
	"gcc-avr"
	"avr-libc"
	"avrdude"
	"python3"
	"python3-pip"
	"python3-tornado"
	"inetutils-ping"
	"curl"
	"unzip"
	"python3-setuptools"
	"gcc-arm-linux-gnueabihf"
	"bc"
	"vim"
	"locate"
	"sudo"
    "sshpass"
)

apt-get update
apt-get upgrade -y

apt-get install -y "${APT_PACKAGES[@]}"

update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-9 9

/usr/bin/python3 -m pip install -U yapf

curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

mkdir -p /root/.ssh
cat > /root/.ssh/config <<- END
Host onefinity
        User bbmc
END
