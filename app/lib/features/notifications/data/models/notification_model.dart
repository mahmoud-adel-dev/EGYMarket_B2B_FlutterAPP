enum NotificationTargetKind {
  order,
  conversation,
  post,
  product,
  organization,
  shipment,
  subscription,
  verification,
  unknown;

  static NotificationTargetKind fromValue(String? value) {
    return switch (value?.toLowerCase()) {
      'order' || 'invoice' || 'request' => order,
      'conversation' || 'chat' || 'message' => conversation,
      'post' => post,
      'product' => product,
      'organization' ||
      'merchant' ||
      'wholesaler' ||
      'customer' => organization,
      'shipment' => shipment,
      'subscription' => subscription,
      'verification' => verification,
      _ => unknown,
    };
  }
}

class NotificationTarget {
  final NotificationTargetKind kind;
  final String id;
  final String? path;

  const NotificationTarget({required this.kind, required this.id, this.path});

  bool get isActionable =>
      kind != NotificationTargetKind.unknown && id.isNotEmpty;
}

class NotificationModel {
  final String id;
  final String type;
  final String title;
  final String body;
  final String? orderId;
  final String? postId;
  final String? conversationId;
  final String? productId;
  final String? entityType;
  final String? entityId;
  final String? targetPath;
  final Map<String, dynamic> metadata;
  final bool isRead;
  final DateTime? createdAt;
  final DateTime? readAt;

  const NotificationModel({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.orderId,
    this.postId,
    this.conversationId,
    this.productId,
    this.entityType,
    this.entityId,
    this.targetPath,
    this.metadata = const {},
    required this.isRead,
    this.createdAt,
    this.readAt,
  });

  NotificationTarget get target {
    final explicitKind = NotificationTargetKind.fromValue(entityType);
    if (explicitKind != NotificationTargetKind.unknown &&
        entityId?.isNotEmpty == true) {
      return NotificationTarget(
        kind: explicitKind,
        id: entityId!,
        path: targetPath,
      );
    }
    if (orderId?.isNotEmpty == true) {
      return NotificationTarget(
        kind: type.contains('tracking')
            ? NotificationTargetKind.shipment
            : NotificationTargetKind.order,
        id: orderId!,
        path: targetPath,
      );
    }
    if (conversationId?.isNotEmpty == true) {
      return NotificationTarget(
        kind: NotificationTargetKind.conversation,
        id: conversationId!,
        path: targetPath,
      );
    }
    if (postId?.isNotEmpty == true) {
      return NotificationTarget(
        kind: NotificationTargetKind.post,
        id: postId!,
        path: targetPath,
      );
    }
    if (productId?.isNotEmpty == true) {
      return NotificationTarget(
        kind: NotificationTargetKind.product,
        id: productId!,
        path: targetPath,
      );
    }
    final targetType = metadata['targetType']?.toString();
    final targetId = metadata['targetId']?.toString() ?? '';
    return NotificationTarget(
      kind: NotificationTargetKind.fromValue(targetType),
      id: targetId,
      path: targetPath,
    );
  }

  NotificationModel copyWith({bool? isRead, DateTime? readAt}) {
    return NotificationModel(
      id: id,
      type: type,
      title: title,
      body: body,
      orderId: orderId,
      postId: postId,
      conversationId: conversationId,
      productId: productId,
      entityType: entityType,
      entityId: entityId,
      targetPath: targetPath,
      metadata: metadata,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt,
      readAt: readAt ?? this.readAt,
    );
  }

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    final metadata = json['metadata'] is Map
        ? Map<String, dynamic>.from(json['metadata'] as Map)
        : const <String, dynamic>{};
    final target = json['target'] is Map
        ? Map<String, dynamic>.from(json['target'] as Map)
        : const <String, dynamic>{};
    String? value(String camel, String snake) =>
        (json[camel] ?? json[snake])?.toString();
    return NotificationModel(
      id: json['id']?.toString() ?? json['_id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'system',
      title: json['title']?.toString() ?? 'إشعار',
      body: json['body']?.toString() ?? '',
      orderId: value('orderId', 'order_id'),
      postId: value('postId', 'post_id'),
      conversationId:
          value('conversationId', 'conversation_id') ??
          metadata['conversationId']?.toString() ??
          (target['kind']?.toString() == 'conversation'
              ? target['id']?.toString()
              : null),
      productId:
          value('productId', 'product_id') ??
          metadata['productId']?.toString() ??
          (target['kind']?.toString() == 'product'
              ? target['id']?.toString()
              : null),
      entityType:
          value('entityType', 'entity_type') ??
          target['kind']?.toString() ??
          target['type']?.toString(),
      entityId: value('entityId', 'entity_id') ?? target['id']?.toString(),
      targetPath:
          value('targetPath', 'target_path') ?? target['path']?.toString(),
      metadata: metadata,
      isRead: json['isRead'] == true || json['is_read'] == true,
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
      readAt: DateTime.tryParse(json['readAt']?.toString() ?? ''),
    );
  }
}
