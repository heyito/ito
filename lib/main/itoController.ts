import { ItoMode } from '@/app/generated/ito_pb'

export class ItoController {
  public startInteraction(mode: ItoMode) {
    // begin streaming audio
    // flip flag so that futher interactions don't interrupt
    // begin gathering context
    // send settings as well
  }

  public changeMode(mode: ItoMode) {
    // change mode on channel
  }

  public endInteraction() {
    // stop streaming audio
    // mark stream as complete for grpc server
    // prepare to write text
  }
}

export const itoController = new ItoController()
