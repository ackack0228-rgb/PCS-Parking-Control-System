"""
messaging/publisher.py
- RabbitMQ에 AI 이벤트를 발행한다.
- consumer.js가 기대하는 메시지 형식에 맞춰 전송한다.
"""

import json
import time
import pika
import config


class RabbitPublisher:
    def __init__(self):
        self.connection = None
        self.channel = None
        self._connect()

    def _connect(self):
        params = pika.URLParameters(config.RABBIT_URL)
        self.connection = pika.BlockingConnection(params)
        self.channel = self.connection.channel()
        self.channel.queue_declare(queue=config.RABBIT_QUEUE, durable=True)
        print(f"[Publisher] RabbitMQ 연결 완료: {config.RABBIT_QUEUE}")

    def publish(self, event: dict):
        """
        이벤트를 RabbitMQ 큐에 발행한다.
        연결이 끊겼을 경우 재연결 후 재시도한다.

        consumer.js 필수 필드:
          event_id, event_type_code, camera_code, device_code, ts
        """
        body  = json.dumps(event, ensure_ascii=False)
        props = pika.BasicProperties(delivery_mode=2)

        try:
            self.channel.basic_publish(
                exchange="",
                routing_key=config.RABBIT_QUEUE,
                body=body,
                properties=props,
            )
        except (
            pika.exceptions.StreamLostError,
            pika.exceptions.AMQPConnectionError,
            pika.exceptions.ChannelClosedByBroker,
        ):
            print("[Publisher] 연결 끊김, 재연결 시도...")
            time.sleep(2)
            self._connect()
            self.channel.basic_publish(
                exchange="",
                routing_key=config.RABBIT_QUEUE,
                body=body,
                properties=props,
            )

    def close(self):
        try:
            self.connection.close()
        except Exception:
            pass
