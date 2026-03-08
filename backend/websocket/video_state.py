from dataclasses import dataclass
import time


@dataclass
class VideoState:
    video_id: str = ""
    current_time: float = 0.0
    is_playing: bool = False
    last_updated: float = 0.0

    def update_time(self, current_time: float, is_playing: bool):
        self.current_time = current_time
        self.is_playing = is_playing
        self.last_updated = time.time()

    def get_estimated_time(self) -> float:
        """Estimate current playback position accounting for elapsed time."""
        if self.is_playing and self.last_updated > 0:
            elapsed = time.time() - self.last_updated
            return self.current_time + elapsed
        return self.current_time

    def to_dict(self) -> dict:
        return {
            "videoId": self.video_id,
            "currentTime": self.current_time,
            "isPlaying": self.is_playing,
        }
