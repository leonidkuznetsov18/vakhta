import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../infra/object-storage.js';
import { CommunicationsController, QuestionnaireController } from './communications.controller.js';
import { CommunicationsService } from './communications.service.js';
import { CommunicationMediaService } from './media.service.js';
import { QuestionnaireService } from './questionnaire.service.js';
@Module({
  imports: [ObjectStorageModule],
  controllers: [CommunicationsController, QuestionnaireController],
  providers: [CommunicationsService, CommunicationMediaService, QuestionnaireService],
})
export class CommunicationsModule {}
