import 'dart:math';

import 'package:easy_localization/easy_localization.dart';

enum ChatMessageType { text, system }

enum ChatDeliveryState { sending, sent, failed }

class ChatParticipantModel {
  final String id;
  final String displayName;
  final String avatarUrl;
  final String type;

  const ChatParticipantModel({
    required this.id,
    required this.displayName,
    required this.avatarUrl,
    required this.type,
  });

  factory ChatParticipantModel.fromJson(Map<String, dynamic> json) {
    return ChatParticipantModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      displayName: json['display_name']?.toString() ?? '',
      avatarUrl: json['avatar_url']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
    );
  }
}

class ChatConversationModel {
  final String id;
  final String conversationType;
  final List<ChatParticipantModel> participants;
  final String? orderNumber;
  final String? productTitle;
  final String lastMessage;
  final DateTime? lastMessageAt;
  final int unreadCount;
  final bool chatAllowed;

  const ChatConversationModel({
    required this.id,
    required this.conversationType,
    required this.participants,
    required this.orderNumber,
    required this.productTitle,
    required this.lastMessage,
    required this.lastMessageAt,
    required this.unreadCount,
    required this.chatAllowed,
  });

  factory ChatConversationModel.fromJson(Map<String, dynamic> json) {
    final order = _mapOrNull(json['order_id']);
    final product = _mapOrNull(json['product_id']);
    final chatAccess = _mapOrNull(json['chat_access']);
    final participantRows = json['participant_organization_ids'] as List?;
    return ChatConversationModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      conversationType: json['conversation_type']?.toString() ?? 'order',
      participants: (participantRows ?? const [])
          .whereType<Map>()
          .map(
            (item) =>
                ChatParticipantModel.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(growable: false),
      orderNumber: order?['order_number']?.toString(),
      productTitle: product?['title']?.toString(),
      lastMessage: json['last_message']?.toString() ?? '',
      lastMessageAt: DateTime.tryParse(
        json['last_message_at']?.toString() ?? '',
      ),
      unreadCount: (json['unread_count'] as num?)?.toInt() ?? 0,
      chatAllowed: chatAccess?['allowed'] != false,
    );
  }

  String titleFor(String currentOrganizationId) {
    final names = participants
        .where((participant) => participant.id != currentOrganizationId)
        .map((participant) => participant.displayName)
        .where((name) => name.isNotEmpty)
        .toList(growable: false);
    if (productTitle?.isNotEmpty == true) {
      return names.isEmpty
          ? tr('inquiry_title', namedArgs: {'product': productTitle!})
          : '${names.join(tr('conversation_name_separator'))} ${tr('conversation_name_divider')} $productTitle';
    }
    return names.isEmpty ? tr('conversation_order') : names.join(tr('conversation_name_separator'));
  }
}

class ChatMessageModel {
  final String id;
  final String? clientMessageId;
  final String senderOrganizationId;
  final String senderDisplayName;
  final String body;
  final ChatMessageType type;
  final String? eventType;
  final DateTime createdAt;
  final ChatDeliveryState deliveryState;

  const ChatMessageModel({
    required this.id,
    required this.clientMessageId,
    required this.senderOrganizationId,
    required this.senderDisplayName,
    required this.body,
    required this.type,
    required this.eventType,
    required this.createdAt,
    required this.deliveryState,
  });

  bool get isSystem => type == ChatMessageType.system;
  bool get isPersisted => !id.startsWith('local:');

  factory ChatMessageModel.fromJson(Map<String, dynamic> json) {
    final sender = _mapOrNull(json['sender_organization_id']);
    final rawSender = json['sender_organization_id'];
    final senderId = sender == null
        ? (rawSender is String ? rawSender : '')
        : (sender['_id'] ?? sender['id'] ?? '').toString();
    return ChatMessageModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      clientMessageId: json['client_message_id']?.toString(),
      senderOrganizationId: senderId,
      senderDisplayName: sender?['display_name']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      type: json['message_type']?.toString() == 'system'
          ? ChatMessageType.system
          : ChatMessageType.text,
      eventType: json['event_type']?.toString(),
      createdAt:
          DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      deliveryState: ChatDeliveryState.sent,
    );
  }

  factory ChatMessageModel.optimistic({
    required String clientMessageId,
    required String senderOrganizationId,
    required String body,
    required DateTime createdAt,
  }) {
    return ChatMessageModel(
      id: 'local:$clientMessageId',
      clientMessageId: clientMessageId,
      senderOrganizationId: senderOrganizationId,
      senderDisplayName: '',
      body: body,
      type: ChatMessageType.text,
      eventType: null,
      createdAt: createdAt,
      deliveryState: ChatDeliveryState.sending,
    );
  }

  ChatMessageModel copyWith({ChatDeliveryState? deliveryState}) {
    return ChatMessageModel(
      id: id,
      clientMessageId: clientMessageId,
      senderOrganizationId: senderOrganizationId,
      senderDisplayName: senderDisplayName,
      body: body,
      type: type,
      eventType: eventType,
      createdAt: createdAt,
      deliveryState: deliveryState ?? this.deliveryState,
    );
  }
}

String createClientMessageId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex.substring(0, 8)}-'
      '${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-'
      '${hex.substring(20)}';
}

Map<String, dynamic>? _mapOrNull(dynamic value) {
  if (value is! Map) return null;
  return Map<String, dynamic>.from(value);
}
