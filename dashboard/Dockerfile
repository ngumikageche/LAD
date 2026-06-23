FROM node:20.19.1

RUN apt-get update && apt-get install -y sudo \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m web_dev \
    && echo "web_dev:pa55word" | chpasswd \
    && echo "web_dev ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

WORKDIR /home/web_dev/lad-dashboard

COPY package*.json ./

RUN chown -R web_dev:web_dev /home/web_dev/lad-dashboard

USER web_dev

RUN npm ci && sudo npm install -g serve

COPY --chown=web_dev:web_dev . .

RUN npm run build

COPY --chown=web_dev:web_dev serve.json ./serve.json

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
